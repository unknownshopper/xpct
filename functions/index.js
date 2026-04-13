import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';

setGlobalOptions({ region: 'us-central1' });

const TZ = process.env.TZ || 'America/Mexico_City';

function extractEmailAddress(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
  if (m && m[1]) return m[1].trim();
  if (s.includes('@') && !s.includes(' ')) return s;
  return s;
}

function normEquipoKey(v) {
  let t = (v || '').toString();
  t = t.replace(/\u00A0/g, ' ');
  t = t.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  return t.toUpperCase().trim();
}

function normPruebaKey(v) {
  return (v || '').toString().toUpperCase().trim();
}

function parseFecha(str) {
  if (!str) return null;
  if (str && typeof str === 'object' && typeof str.toDate === 'function') {
    const d = str.toDate();
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (str instanceof Date) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof str === 'number' && isFinite(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
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
    const year = aaStr.length <= 2 ? (2000 + aa) : aa;
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
  if (admin.apps && admin.apps.length) return;
  admin.initializeApp();
}

async function queryUltimasAnuales() {
  const db = admin.firestore();
  const snap = await db.collection('pruebas').get();
  const porEquipoPrueba = new Map();

  snap.forEach(doc => {
    const data = doc.data() || {};
    const periodo = (data.periodo || '').toString().trim().toUpperCase();
    if (periodo && periodo !== 'ANUAL') return;

    const equipoRaw = (data.equipo || data.equipoId || data.activo || '').toString().trim();
    const equipoDisplay = equipoRaw || doc.id;
    const equipoKey = normEquipoKey(equipoRaw);

    const prueba = (data.prueba || data.pruebaTipo || '').toString().trim();
    const pruebaKey = normPruebaKey(prueba || 'ANUAL');

    const serial = (data.numeroSerie || data.serial || '').toString().trim();
    const fechaReal = parseFecha(data.fechaRealizacion || data.fechaPrueba || data.fecha || '');

    let proxima = parseFecha(data.proxima || '');
    if (!proxima && fechaReal) {
      const d = new Date(fechaReal);
      d.setFullYear(d.getFullYear() + 1);
      d.setHours(0, 0, 0, 0);
      if (!isNaN(d.getTime())) proxima = d;
    }

    let failReason = '';
    if (!equipoRaw) failReason = 'SIN_EQUIPO';
    if (!proxima) failReason = failReason || 'SIN_PROXIMA';

    const key = `${equipoKey || normEquipoKey(equipoDisplay)}__${pruebaKey}`;
    const current = porEquipoPrueba.get(key);
    const payload = {
      docId: doc.id,
      equipo: equipoDisplay,
      serial,
      prueba: pruebaKey,
      fechaReal,
      proxima,
      failReason,
      raw: data
    };

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
  if (dias <= 0) return { dias, bucket: 'vencidas' };
  if (dias >= 31 && dias <= 60) return { dias, bucket: '60_30' };
  if (dias >= 16 && dias <= 30) return { dias, bucket: '30_15' };
  if (dias >= 1 && dias <= 15) return { dias, bucket: '15_0' };
  return { dias, bucket: 'otras' };
}

function buildHtml({ lista60, lista30, lista15, lista0, listaFail }) {
  const fmt = d => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat('dd/LL/yyyy') : '—');
  const estadoFromDias = dias => (dias < 0 ? 'Vencida' : 'Vigente');
  const section = (titulo, items, opts = {}) => {
    if (!items.length) return '';
    const includeEstado = opts.includeEstado !== false;
    const includeMotivo = !!opts.includeMotivo;
    const rows = items
      .sort((a, b) => a.dias - b.dias)
      .map(x => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${x.equipo}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${x.serial || '—'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${x.prueba || '—'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${fmt(x.proxima)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${(x.dias ?? '—')}</td>
          ${includeEstado ? `<td style=\"padding:6px 8px;border-bottom:1px solid #e5e7eb;\">${typeof x.dias === 'number' ? estadoFromDias(x.dias) : '—'}</td>` : ''}
          ${includeMotivo ? `<td style=\"padding:6px 8px;border-bottom:1px solid #e5e7eb;\">${x.failReason || '—'}</td>` : ''}
        </tr>
      `).join('');
    return `
      <h3 style="margin:14px 0 6px; font-size:14px; color:#111827;">${titulo} (${items.length})</h3>
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Equipo</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Serial</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Prueba / Calib.</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Próxima</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Días</th>
            ${includeEstado ? '<th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Estado</th>' : ''}
            ${includeMotivo ? '<th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Motivo</th>' : ''}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  const headerHtml = `
    <div style="padding:12px 0 8px; display:flex; align-items:center; gap:12px;">
      <div style="font-size:18px; font-weight:600; color:#111827;">Alertas de pruebas por vencer</div>
    </div>
  `;

  const mainHtml = `
    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827;">
      ${headerHtml}
      <p style="margin:4px 0 12px; font-size:13px; color:#4b5563;">Solo se consideran pruebas ANUALES.</p>
      ${section('60–31 días', lista60)}
      ${section('30–16 días', lista30)}
      ${section('15–1 días (envío diario)', lista15)}
      ${section('💀 0 días (vencidas)', lista0)}
      ${section('Fallidos', listaFail, { includeMotivo: true })}
    </div>
  `;

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

function getMailRecipients() {
  const toRaw = process.env.MAIL_TO || '';
  const extraRaw = process.env.MAIL_TO_EXTRA || '';
  const merged = `${toRaw};${extraRaw}`;
  const toList = Array.from(new Set(
    merged
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean)
  ));
  return { toList };
}

async function enviarCorreo({ html, subject }) {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(String(process.env.SMTP_PORT || '587').trim(), 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');

  if (!host || !host.includes('.')) throw new Error('SMTP_HOST is invalid or empty');
  if (!port || Number.isNaN(port)) throw new Error('SMTP_PORT is invalid');
  if (!user) throw new Error('SMTP_USER is empty');

  const fromRaw = (process.env.MAIL_FROM || '').trim();
  const fromName = (process.env.MAIL_FROM_NAME || 'PCT Alertas').trim();
  const from = fromRaw ? fromRaw : { name: fromName, address: user };
  const fromAddress = extractEmailAddress(fromRaw || user);

  const { toList } = getMailRecipients();
  if (!toList.length) throw new Error('MAIL_TO is empty or invalid');

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    logger: process.env.SMTP_DEBUG === '1',
    debug: process.env.SMTP_DEBUG === '1'
  });

  return transporter.sendMail({
    from,
    to: toList.join(', '),
    subject,
    html,
    envelope: { from: fromAddress, to: toList }
  });
}

async function calcularYEnviar({ testMode = false, force = false }) {
  ensureAdmin();
  const db = admin.firestore();
  const ultimas = await queryUltimasAnuales();

  const lista60 = [];
  const lista30 = [];
  const lista15 = [];
  const lista0 = [];
  const listaFail = [];

  for (const reg of ultimas) {
    const equipoKey = reg.equipo || reg.docId;
    const pruebaKey = normPruebaKey(reg.prueba || 'ANUAL');

    if (reg.failReason) {
      listaFail.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias: null, failReason: reg.failReason });
      continue;
    }

    const { dias, bucket } = clasificarDias(reg.proxima);
    if (bucket === 'vencidas') {
      lista0.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
      continue;
    }

    if (bucket === '60_30' || bucket === '30_15' || bucket === '15_0') {
      const trackId = `${normEquipoKey(equipoKey)}__${pruebaKey}`;
      const trackRef = db.collection('alertas_pruebas').doc(trackId);
      const trackSnap = await trackRef.get();
      const t = trackSnap.exists ? trackSnap.data() : {};

      if (bucket === '60_30') {
        lista60.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
        if ((force || !t.notif60At) && !testMode) {
          await trackRef.set({ ...t, notif60At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '30_15') {
        lista30.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
        if ((force || !t.notif30At) && !testMode) {
          await trackRef.set({ ...t, notif30At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '15_0') {
        lista15.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
        if (!testMode) await trackRef.set({ ...t, notif15LastAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }

  const html = buildHtml({ lista60, lista30, lista15, lista0, listaFail });
  const subject = `Alertas pruebas por vencer – ${DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy')}`;

  if (!lista60.length && !lista30.length && !lista15.length && !lista0.length && !listaFail.length) {
    if (testMode) {
      await enviarCorreo({ html, subject });
      const { toList } = getMailRecipients();
      return { sent: true, empty: true, to: toList };
    }
    return { sent: false, empty: true };
  }

  await enviarCorreo({ html, subject });
  const { toList } = getMailRecipients();

  return {
    sent: true,
    empty: false,
    counts: { c60: lista60.length, c30: lista30.length, c15: lista15.length, c0: lista0.length, cFail: listaFail.length },
    to: toList
  };
}

export const sendAlertsDaily = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: TZ,
    retryCount: 2,
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: ['SMTP_PASS', 'SMTP_USER'],
  },
  async () => {
    const out = await calcularYEnviar({ testMode: false, force: false });
    console.log('sendAlertsDaily result:', out);
  }
);
