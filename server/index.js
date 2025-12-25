import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';
import admin from 'firebase-admin';

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

async function queryUltimasAnuales() {
  const db = admin.firestore();
  const snap = await db.collection('pruebas').get();
  const porEquipo = new Map();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  snap.forEach(doc => {
    const data = doc.data() || {};
    const periodo = (data.periodo || '').toString().trim().toUpperCase();
    if (periodo && periodo !== 'ANUAL') return;
    const equipo = (data.equipo || data.equipoId || data.activo || '').toString().trim() || doc.id;
    const fechaReal = parseFecha(data.fechaRealizacion || data.fecha || '');
    const proxima = parseFecha(data.proxima || '');
    const current = porEquipo.get(equipo);
    const payload = { docId: doc.id, equipo, fechaReal, proxima, raw: data };
    if (!current) {
      porEquipo.set(equipo, payload);
    } else {
      const a = current.fechaReal || new Date(0);
      const b = fechaReal || new Date(0);
      if (b.getTime() >= a.getTime()) porEquipo.set(equipo, payload);
    }
  });

  return Array.from(porEquipo.values());
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
  const section = (titulo, items) => {
    if (!items.length) return '';
    const rows = items
      .sort((a, b) => a.dias - b.dias)
      .map(x => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${x.equipo}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${fmt(x.proxima)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${x.dias}</td>
        </tr>
      `).join('');
    return `
      <h3 style="margin:14px 0 6px; font-size:14px; color:#111827;">${titulo} (${items.length})</h3>
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Equipo</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Próxima</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Días</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  const body = `
    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <h2 style="margin:0 0 8px;">Alertas de pruebas por vencer</h2>
      <p style="margin:0 0 10px; font-size:13px; color:#4b5563;">Solo se consideran pruebas ANUAL. Checkpoints no reinician ni afectan el contador.</p>
      ${section('60–30 días', lista60)}
      ${section('30–15 días', lista30)}
      ${section('15–0 días (envío diario)', lista15)}
    </div>
  `;
  return body;
}

async function enviarCorreo({ html, subject }) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;
  const to = process.env.MAIL_TO;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  const info = await transporter.sendMail({ from, to, subject, html });
  return info.messageId || 'ok';
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
    if (bucket === '60_30' || bucket === '30_15' || bucket === '15_0') {
      const trackId = `${equipoKey}__${reg.docId}`;
      const trackRef = db.collection('alertas_pruebas').doc(trackId);
      const trackSnap = await trackRef.get();
      const t = trackSnap.exists ? trackSnap.data() : {};
      if (bucket === '60_30') {
        if (!t.notif60At) {
          lista60.push({ equipo: equipoKey, proxima: reg.proxima, dias });
          if (!testMode) await trackRef.set({ ...t, notif60At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '30_15') {
        if (!t.notif30At) {
          lista30.push({ equipo: equipoKey, proxima: reg.proxima, dias });
          if (!testMode) await trackRef.set({ ...t, notif30At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '15_0') {
        lista15.push({ equipo: equipoKey, proxima: reg.proxima, dias });
        if (!testMode) await trackRef.set({ ...t, notif15LastAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }

  if (!lista60.length && !lista30.length && !lista15.length) {
    if (testMode) {
      const subject = `[XPCT] Prueba de correo – ${DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy HH:mm')}`;
      const html = '<div style="font-family:Arial, Helvetica, sans-serif; font-size:14px;">Correo de prueba OK</div>';
      await enviarCorreo({ html, subject });
      return { sent: true, empty: true };
    }
    return { sent: false, empty: true };
  }

  const html = buildHtml({ lista60, lista30, lista15 });
  const subject = `[XPCT] Alertas pruebas por vencer – ${DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy')}`;
  await enviarCorreo({ html, subject });
  return { sent: true, empty: false, counts: { c60: lista60.length, c30: lista30.length, c15: lista15.length } };
}

const app = express();
app.use(express.json());

app.post('/api/send-alerts', async (req, res) => {
  try {
    const testMode = String(req.query.test || 'false') === 'true';
    const out = await calcularYEnviar({ testMode });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'send_failed', detail: String(e && e.message ? e.message : e) });
  }
});

// Lightweight SMTP-only test: does NOT touch Firestore
app.post('/api/test-smtp', async (req, res) => {
  try {
    const now = DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy HH:mm');
    const subject = `[XPCT] Prueba SMTP directa – ${now}`;
    const html = '<div style="font-family:Arial, Helvetica, sans-serif; font-size:14px;">Prueba de envío SMTP directa OK</div>';
    const id = await enviarCorreo({ html, subject });
    res.json({ ok: true, messageId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'smtp_test_failed', detail: String(e && e.message ? e.message : e) });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: DateTime.now().setZone(TZ).toISO() });
});

app.listen(PORT, () => {
  // no-op
});
