import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8080;
const TZ = process.env.TZ || 'America/Mexico_City';

function parseFecha(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s) return null;
  if (s.includes('/')) {
    const partes = s.split('/');
    if (partes.length !== 3) return null;
    const [ddStr, mmStr, aaStr] = partes;
    const dd = parseInt(ddStr, 10);
    const mm = parseInt(mmStr, 10);
    const aa = parseInt(aaStr, 10);
    if (!dd || !mm || isNaN(aa)) return null;
    const year = aa < 100 ? 2000 + aa : aa;
    const d = new Date(year, mm - 1, dd);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function ensureAdmin() {
  if (admin.apps.length) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const creds = JSON.parse(json);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  } else {
    admin.initializeApp();
  }
}

async function verifyFirebaseIdToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : '';
  if (!token) {
    const e = new Error('missing_token');
    e.code = 'missing_token';
    throw e;
  }
  ensureAdmin();
  return admin.auth().verifyIdToken(token);
}

function requireAdminEmail(emailLower) {
  const expected = (emailLower || '').toLowerCase().trim();
  return async (req, res, next) => {
    try {
      const decoded = await verifyFirebaseIdToken(req);
      const actual = String(decoded.email || '').toLowerCase().trim();
      if (!actual || actual !== expected) {
        return res.status(403).json({ error: 'forbidden' });
      }
      req.user = decoded;
      next();
    } catch (e) {
      const code = e && e.code ? e.code : 'unauthorized';
      res.status(401).json({ error: 'unauthorized', code });
    }
  };
}

async function queryUltimasAnuales() {
  const db = admin.firestore();
  const snap = await db.collection('pruebas').get();
  const porEquipoPrueba = new Map();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  snap.forEach(doc => {
    const data = doc.data() || {};
    const periodo = (data.periodo || '').toString().trim().toUpperCase();
    // Backward compat: sin periodo => tratar como ANUAL
    if (periodo && periodo !== 'ANUAL') return;
    const equipo = (data.equipo || data.equipoId || data.activo || '').toString().trim() || doc.id;
    const prueba = (data.prueba || data.pruebaTipo || '').toString().trim();
    const fechaReal = parseFecha(data.fechaRealizacion || data.fecha || '');
    let proxima = parseFecha(data.proxima || '');
    // Derivar próxima a partir de fechaReal + 1 año si falta
    if (!proxima && fechaReal) {
      const d = new Date(fechaReal);
      d.setFullYear(d.getFullYear() + 1);
      d.setHours(0, 0, 0, 0);
      if (!isNaN(d.getTime())) proxima = d;
    }
    const key = `${equipo}__${(prueba || 'ANUAL').toUpperCase()}`;
    const current = porEquipoPrueba.get(key);
    const payload = { docId: doc.id, equipo, prueba, fechaReal, proxima, raw: data };
    if (!current) {
      porEquipoPrueba.set(key, payload);
    } else {
      const a = current.fechaReal || new Date(0);
      const b = fechaReal || new Date(0);
      if (b.getTime() >= a.getTime()) porEquipoPrueba.set(key, payload);
    }
  });

  return Array.from(porEquipoPrueba.values());
}

function clasificarDias(proxima) {
  if (!proxima) return { dias: null, bucket: null };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = proxima.getTime() - hoy.getTime();
  const dias = Math.round(diff / (1000 * 60 * 60 * 24));
  if (dias < 0) return { dias, bucket: 'vencidas' };
  if (dias >= 30 && dias <= 60) return { dias, bucket: '60_30' };
  if (dias >= 15 && dias < 30) return { dias, bucket: '30_15' };
  if (dias >= 0 && dias < 15) return { dias, bucket: '15_0' };
  return { dias, bucket: 'otras' };
}

function buildHtml({ lista60, lista30, lista15 }) {
  const fmt = d => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat('dd/LL/yyyy') : '—');
  const estadoFromDias = dias => (dias < 0 ? 'Vencida' : 'Vigente');
  const section = (titulo, items) => {
    if (!items.length) return '';
    const rows = items
      .sort((a, b) => a.dias - b.dias)
      .map(x => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${x.equipo}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${x.prueba || '—'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${fmt(x.proxima)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${x.dias}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${estadoFromDias(x.dias)}</td>
        </tr>
      `).join('');
    return `
      <h3 style="margin:14px 0 6px; font-size:14px; color:#111827;">${titulo} (${items.length})</h3>
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Equipo</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Prueba / Calib.</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Próxima</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Días</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Estado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  // Header with logo (CID must be attached when sending)
  const headerHtml = `
    <div style="padding:12px 0 8px; display:flex; align-items:center; gap:12px;">
      <img src="cid:logo_pctch" alt="PCT" style="height:36px; width:auto; display:block;" />
      <div style="font-size:18px; font-weight:600; color:#111827;">Alertas de pruebas por vencer</div>
    </div>
  `;

  const mainHtml = `
    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827;">
      ${headerHtml}
      <p style="margin:4px 0 12px; font-size:13px; color:#4b5563;">Solo se consideran pruebas ANUALES.</p>
      ${section('60–30 días', lista60)}
      ${section('30–15 días', lista30)}
      ${section('15–0 días (envío diario)', lista15)}
    </div>
  `;

  // Confidentiality footer
  const footerHtml = `
    <div style="margin-top:16px; padding-top:10px; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-size:11px; color:#6b7280; line-height:1.35;">
        Aviso de confidencialidad: Este mensaje y sus anexos están dirigidos únicamente a su destinatario y pueden contener información confidencial y/o privilegiada. Si usted no es el destinatario, se le notifica que cualquier revisión, retransmisión, difusión o cualquier otro uso de, o tomar cualquier acción en base a esta información, queda estrictamente prohibido. Si recibió este mensaje por error, por favor elimínelo y notifique al remitente.
      </p>
    </div>
  `;

  return `
    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827;">
      ${mainHtml}
      ${footerHtml}
    </div>
  `;
}

async function enviarCorreo({ html, subject }) {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(String(process.env.SMTP_PORT || '587').trim(), 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');
  if (!host || !host.includes('.')) throw new Error('SMTP_HOST is invalid or empty');
  if (!port || Number.isNaN(port)) throw new Error('SMTP_PORT is invalid');
  if (!user) throw new Error('SMTP_USER is empty');
  // Build sender with display name without requiring config changes
  const fromAddress = process.env.MAIL_FROM || user;
  const from = { name: process.env.MAIL_FROM_NAME || 'PCT Alertas', address: fromAddress };
  // Parse recipient list (comma/semicolon separated) and build SMTP envelope with plain addresses
  const toRaw = process.env.MAIL_TO || '';
  const toList = toRaw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
  if (!toList.length) {
    throw new Error('MAIL_TO is empty or invalid');
  }
  // Try to attach local logo image if present (logopctch.png only)
  // When running from server/ (npm start), the image usually lives at ../img/logopctch.png
  // If you run from the project root, img/logopctch.png will be used.
  const candidates = [
    path.resolve(process.cwd(), 'img/logopctch.png'),
    path.resolve(process.cwd(), '../img/logopctch.png'),
  ];
  let foundLogo = null;
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { foundLogo = p; break; } } catch {}
  }
  const attachments = foundLogo
    ? [{ filename: path.basename(foundLogo), path: foundLogo, cid: 'logo_pctch' }]
    : [];
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    logger: process.env.SMTP_DEBUG === '1',
    debug: process.env.SMTP_DEBUG === '1'
  });
  const info = await transporter.sendMail({
    from,
    to: toList.join(', '),
    subject,
    html,
    attachments,
    envelope: { from: fromAddress, to: toList }
  });
  if (process.env.SMTP_DEBUG === '1') {
    try { console.log('SMTP sendMail info:', { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }); } catch {}
  }
  return info;
}

async function calcularYEnviar({ testMode = false }) {
  ensureAdmin();
  const db = admin.firestore();
  const ultimas = await queryUltimasAnuales();

  const lista60 = [];
  const lista30 = [];
  const lista15 = [];

  for (const reg of ultimas) {
    const { dias, bucket } = clasificarDias(reg.proxima);
    const equipoKey = reg.equipo || reg.docId;
    const pruebaKey = (reg.prueba || 'ANUAL').toUpperCase();
    if (bucket === '60_30' || bucket === '30_15' || bucket === '15_0') {
      const trackId = `${equipoKey}__${pruebaKey}`;
      const trackRef = db.collection('alertas_pruebas').doc(trackId);
      const trackSnap = await trackRef.get();
      const t = trackSnap.exists ? trackSnap.data() : {};
      if (bucket === '60_30') {
        if (!t.notif60At) {
          lista60.push({ equipo: equipoKey, prueba: reg.prueba, proxima: reg.proxima, dias });
          if (!testMode) await trackRef.set({ ...t, notif60At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '30_15') {
        if (!t.notif30At) {
          lista30.push({ equipo: equipoKey, prueba: reg.prueba, proxima: reg.proxima, dias });
          if (!testMode) await trackRef.set({ ...t, notif30At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '15_0') {
        lista15.push({ equipo: equipoKey, prueba: reg.prueba, proxima: reg.proxima, dias });
        if (!testMode) await trackRef.set({ ...t, notif15LastAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }

  if (!lista60.length && !lista30.length && !lista15.length) {
    if (testMode) {
      const subject = `[PCT] Prueba de correo – ${DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy HH:mm')}`;
      const html = '<div style="font-family:Arial, Helvetica, sans-serif; font-size:14px;">Correo de prueba OK</div>';
      await enviarCorreo({ html, subject });
      return { sent: true, empty: true };
    }
    return { sent: false, empty: true };
  }
  

  
  const html = buildHtml({ lista60, lista30, lista15 });
  const subject = `Alertas pruebas por vencer – ${DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy')}`;
  await enviarCorreo({ html, subject });
  return { sent: true, empty: false, counts: { c60: lista60.length, c30: lista30.length, c15: lista15.length } };
}

const app = express();
app.use(express.json());
// Enable CORS for local dev UI (port 2200) and same-origin
app.use(cors({
  origin: [
    'http://localhost:2200',
    'http://127.0.0.1:2200',
  ],
  methods: ['GET','POST','OPTIONS'],
}));

app.post('/api/send-alerts', async (req, res) => {
  try {
    const testMode = String(req.query.test || 'false') === 'true';
    const out = await calcularYEnviar({ testMode });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'send_failed', detail: String(e && e.message ? e.message : e) });
  }
});

// Audit log (admin-only)
app.get('/api/audit', requireAdminEmail('the@unknownshoppers.com'), async (req, res) => {
  try {
    ensureAdmin();
    const db = admin.firestore();
    const limitN = Math.min(Math.max(parseInt(String(req.query.limit || '200'), 10) || 200, 1), 500);
    const startAfterMs = parseInt(String(req.query.startAfterMs || ''), 10);
    const email = String(req.query.email || '').trim().toLowerCase();

    let q = db.collection('audit_logs');
    if (email) q = q.where('email', '==', email);
    q = q.orderBy('at', 'desc').limit(limitN);
    if (!Number.isNaN(startAfterMs) && startAfterMs > 0) {
      q = q.startAfter(admin.firestore.Timestamp.fromMillis(startAfterMs));
    }

    const snap = await q.get();
    const items = snap.docs.map(d => {
      const data = d.data() || {};
      const atMs = data.at && typeof data.at.toMillis === 'function' ? data.at.toMillis() : null;
      return { id: d.id, ...data, atMs };
    });
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'audit_failed', detail: String(e && e.message ? e.message : e) });
  }
});

// Lightweight SMTP-only test: does NOT touch Firestore
app.post('/api/test-smtp', async (req, res) => {
  try {
    const now = DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy HH:mm');
    const subject = `[PCT] Prueba SMTP directa – ${now}`;
    const html = '<div style="font-family:Arial, Helvetica, sans-serif; font-size:14px;">Prueba de envío SMTP directa OK</div>';
    const info = await enviarCorreo({ html, subject });
    res.json({ ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'smtp_test_failed', detail: String(e && e.message ? e.message : e) });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: DateTime.now().setZone(TZ).toISO() });
});

// If RUN_ONCE is set, execute and exit (useful for schedulers/CI)
if (process.env.RUN_ONCE) {
  const mode = String(process.env.RUN_ONCE).toLowerCase();
  const testMode = mode === 'send-alerts-test';
  calcularYEnviar({ testMode })
    .then(out => {
      if (process.env.SMTP_DEBUG === '1') {
        try { console.log('RUN_ONCE result:', out); } catch {}
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('RUN_ONCE failed:', err && err.message ? err.message : err);
      process.exit(1);
    });
} else {
  app.listen(PORT, () => {
    // no-op
  });
}
