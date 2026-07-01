import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onRequest } from 'firebase-functions/v2/https';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';

import fs from 'fs';
import path from 'path';

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

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  const s = String(line ?? '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function safeReadLocalFile(relPath) {
  try {
    const cwd = process.cwd();
    const candidates = [
      path.resolve(cwd, relPath),
      path.resolve(cwd, '..', relPath),
      path.resolve(cwd, '..', '..', relPath),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      } catch {}
    }
    return '';
  } catch {
    return '';
  }
}

async function fetchTextWithTimeout(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ac.signal });
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    return '';
  } finally {
    try { clearTimeout(t); } catch {}
  }
}

async function loadCanonicalMaps() {
  const invLocal = safeReadLocalFile('docs/INVENTARIOTOTAL04-202602.csv');
  const aliasLocal = safeReadLocalFile('docs/malescritos.csv');

  // Fallback: cargar desde hosting (si no se empaquetaron en Functions)
  const baseUrl = String(process.env.CANONICAL_CSV_BASE_URL || 'https://unknownshopper.github.io/xpct').replace(/\/+$/, '');
  const invText = invLocal || await fetchTextWithTimeout(`${baseUrl}/docs/INVENTARIOTOTAL04-202602.csv`);
  const aliasText = aliasLocal || await fetchTextWithTimeout(`${baseUrl}/docs/malescritos.csv`);

  return {
    aliasMap: loadAliasesFromCsvText(aliasText),
    serialPorEquipoInv: loadSerialPorEquipoFromInventarioCsvText(invText),
  };
}

let _canonicalMapsPromise = null;
function getCanonicalMaps() {
  if (!_canonicalMapsPromise) _canonicalMapsPromise = loadCanonicalMaps();
  return _canonicalMapsPromise;
}

function loadAliasesFromCsvText(text) {
  const map = {};
  try {
    const lines = String(text || '').split(/\r?\n/).filter(l => String(l || '').trim() !== '');
    if (!lines.length) return map;
    const headers = parseCSVLine(lines[0]).map(h => String(h || '').trim());
    const idxMal = headers.indexOf('Equipo mal escrito');
    const idxOk = headers.indexOf('Equipo correcto');
    if (idxMal < 0 || idxOk < 0) return map;
    lines.slice(1).forEach(l => {
      const cols = parseCSVLine(l);
      const mal = (idxMal >= 0 && idxMal < cols.length) ? cols[idxMal] : '';
      const ok = (idxOk >= 0 && idxOk < cols.length) ? cols[idxOk] : '';
      const kmal = normEquipoKey(mal);
      const kok = normEquipoKey(ok);
      if (!kmal || !kok) return;
      map[kmal] = kok;
    });
  } catch {}
  return map;
}

function loadSerialPorEquipoFromInventarioCsvText(text) {
  const serialPorEquipo = {};
  try {
    const lines = String(text || '').split(/\r?\n/).filter(l => String(l || '').trim() !== '');
    if (!lines.length) return serialPorEquipo;
    const headers = parseCSVLine(lines[0]).map(h => String(h || '').trim());
    const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
    const idxSerial = headers.indexOf('SERIAL');
    if (idxEquipo < 0) return serialPorEquipo;
    lines.slice(1).forEach(l => {
      const cols = parseCSVLine(l);
      const eq = (idxEquipo >= 0 && idxEquipo < cols.length) ? cols[idxEquipo] : '';
      const sr = (idxSerial >= 0 && idxSerial < cols.length) ? cols[idxSerial] : '';
      const eqK = normEquipoKey(eq);
      const srK = String(sr || '').trim();
      if (!eqK) return;
      if (srK && !serialPorEquipo[eqK]) serialPorEquipo[eqK] = srK;
    });
  } catch {}
  return serialPorEquipo;
}

function resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv }) {
  const eq0 = normEquipoKey(equipoRaw);
  const sr0 = String(serialRaw || '').trim();
  let eqCanon = (eq0 && aliasMap && aliasMap[eq0]) ? String(aliasMap[eq0] || '') : eq0;
  try {
    // Intentar canonicalización por inventario (ej: PCT-XO-77 => PCT-XO-077)
    if (eqCanon && !(serialPorEquipoInv && serialPorEquipoInv[eqCanon])) {
      const m = String(eqCanon).match(/^(.*-)(\d{1,3})$/);
      if (m && m[1] && m[2] && m[2].length < 3) {
        const padded = `${m[1]}${String(m[2]).padStart(3, '0')}`;
        const paddedKey = normEquipoKey(padded);
        if (paddedKey && serialPorEquipoInv && serialPorEquipoInv[paddedKey]) {
          eqCanon = paddedKey;
        }
      }
    }
  } catch {}
  let srCanon = sr0;
  try {
    const srInv = (eqCanon && serialPorEquipoInv && serialPorEquipoInv[eqCanon])
      ? String(serialPorEquipoInv[eqCanon] || '').trim()
      : '';
    if (srInv) srCanon = srInv;
  } catch {}
  return { equipoCanon: eqCanon, serialCanon: srCanon };
}

function fmtYYYYMMDD(d) {
  if (!d || isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function ensureAdmin() {
  if (admin.apps && admin.apps.length) return;
  admin.initializeApp();
}

async function queryUltimasAnuales() {
  const db = admin.firestore();
  const snap = await db.collection('pruebas').get();
  const porEquipoPrueba = new Map();

  // Canonicalización (Opción A): alias + inventario como fuente de verdad
  const { aliasMap, serialPorEquipoInv } = await getCanonicalMaps();

  snap.forEach(doc => {
    const data = doc.data() || {};
    const periodo = (data.periodo || '').toString().trim().toUpperCase();
    if (periodo && periodo !== 'ANUAL') return;

    const equipoRaw = (data.equipo || data.equipoId || data.activo || '').toString().trim();
    const serialRaw = (data.numeroSerie || data.serial || '').toString().trim();
    const resolved = resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv });
    const equipoCanon = resolved.equipoCanon;
    const serialCanon = resolved.serialCanon;

    const equipoDisplay = equipoCanon || equipoRaw || doc.id;
    const equipoKey = normEquipoKey(equipoDisplay);

    const prueba = (data.prueba || data.pruebaTipo || '').toString().trim();
    const pruebaKey = normPruebaKey(prueba || 'ANUAL');

    const serial = serialCanon;
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

  const toList = Array.from(new Set(
    toRaw
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean)
  ));

  const bccList = Array.from(new Set(
    extraRaw
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean)
  ));

  return { toList, bccList };
}

function isMailDisabled() {
  const v = String(process.env.MAIL_DISABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function getMailOnlyHour() {
  const raw = String(process.env.MAIL_ONLY_HOUR || '').trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  if (n < 0 || n > 23) return null;
  return n;
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
  const fromName = (process.env.MAIL_FROM_NAME || 'PCT Notificaciones').trim();
  const from = fromRaw ? fromRaw : { name: fromName, address: user };
  const fromAddress = extractEmailAddress(fromRaw || user);

  const { toList, bccList } = getMailRecipients();
  if (!toList.length) throw new Error('MAIL_TO is empty or invalid');

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    logger: process.env.SMTP_DEBUG === '1',
    debug: process.env.SMTP_DEBUG === '1'
  });

  const envelopeTo = Array.from(new Set([...(toList || []), ...(bccList || [])]));
  return transporter.sendMail({
    from,
    to: toList.join(', '),
    bcc: bccList.length ? bccList.join(', ') : undefined,
    subject,
    html,
    envelope: { from: fromAddress, to: envelopeTo }
  });
}

async function calcularYEnviar({ testMode = false, force = false }) {
  ensureAdmin();
  const db = admin.firestore();
  const ultimas = await queryUltimasAnuales();

  const { toList, bccList } = getMailRecipients();
  const mailDisabled = isMailDisabled();
  const onlyHour = getMailOnlyHour();

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

  const empty = (!lista60.length && !lista30.length && !lista15.length && !lista0.length && !listaFail.length);

  if (mailDisabled) {
    return {
      sent: false,
      disabled: true,
      empty,
      counts: empty ? undefined : { c60: lista60.length, c30: lista30.length, c15: lista15.length, c0: lista0.length, cFail: listaFail.length },
      to: toList,
      bcc: bccList,
    };
  }

  if (!force && onlyHour != null) {
    const now = DateTime.now().setZone(TZ);
    if (now.hour !== onlyHour) {
      return {
        sent: false,
        gated: true,
        onlyHour,
        hourNow: now.hour,
        empty,
        counts: empty ? undefined : { c60: lista60.length, c30: lista30.length, c15: lista15.length, c0: lista0.length, cFail: listaFail.length },
        to: toList,
        bcc: bccList,
      };
    }
  }

  if (empty) {
    if (testMode) {
      await enviarCorreo({ html, subject });
      return { sent: true, empty: true, to: toList, bcc: bccList };
    }
    return { sent: false, empty: true };
  }

  await enviarCorreo({ html, subject });

  return {
    sent: true,
    empty: false,
    counts: { c60: lista60.length, c30: lista30.length, c15: lista15.length, c0: lista0.length, cFail: listaFail.length },
    to: toList,
    bcc: bccList
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

export const normalizePruebasEquipos = onRequest(
  {
    secrets: ['NORMALIZE_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-normalize-key') || '').toString();
      const expected = (process.env.NORMALIZE_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();

      const dryRun = String(req.query.dryRun || '').trim() === '1';
      const limit = Math.max(1, Math.min(10000, parseInt(String(req.query.limit || '0'), 10) || 0));

      const { aliasMap, serialPorEquipoInv } = await getCanonicalMaps();

      const batchLimit = 400;
      let scanned = 0;
      let changed = 0;
      let applied = 0;
      const samples = [];

      const snap = await db.collection('pruebas').get();
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += batchLimit) {
        if (limit && scanned >= limit) break;
        const chunk = docs.slice(i, i + batchLimit);
        let batch = null;
        if (!dryRun) batch = db.batch();

        for (const d of chunk) {
          if (limit && scanned >= limit) break;
          scanned += 1;
          const data = d.data() || {};

          const equipoRaw = (data.equipo || data.equipoId || data.activo || '').toString().trim();
          const serialRaw = (data.numeroSerie || data.serial || '').toString().trim();
          if (!equipoRaw) continue;

          const resolved = resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv });
          const equipoCanon = resolved.equipoCanon;
          const serialCanon = resolved.serialCanon;

          const equipoCurrent = (data.equipo || '').toString().trim();
          const serialCurrent = (data.serial || '').toString().trim();
          const numeroSerieCurrent = (data.numeroSerie || '').toString().trim();

          const updates = {};
          if (equipoCanon && equipoCanon !== normEquipoKey(equipoCurrent)) {
            updates.equipo = equipoCanon;
          }
          if (serialCanon) {
            if (serialCurrent && serialCanon !== serialCurrent) updates.serial = serialCanon;
            if (numeroSerieCurrent && serialCanon !== numeroSerieCurrent) updates.numeroSerie = serialCanon;
            if (!serialCurrent && !numeroSerieCurrent) updates.serial = serialCanon;
          }

          const keys = Object.keys(updates);
          if (!keys.length) continue;

          changed += 1;
          if (samples.length < 30) {
            samples.push({ docId: d.id, from: { equipo: data.equipo || '', serial: data.serial || data.numeroSerie || '' }, to: { equipo: updates.equipo || data.equipo || '', serial: updates.serial || updates.numeroSerie || data.serial || data.numeroSerie || '' } });
          }

          if (!dryRun && batch) {
            batch.update(d.ref, updates);
          }
        }

        if (!dryRun && batch) {
          await batch.commit();
          applied += 1;
        }
      }

      res.status(200).json({ ok: true, dryRun, scanned, changed, batchesCommitted: applied, samples });
    } catch (e) {
      res.status(500).send(String(e && e.message ? e.message : e));
    }
  }
);

export const importPanual1 = onRequest(
  {
    secrets: ['PANUAL_IMPORT_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-panual-key') || '').toString();
      const expected = (process.env.PANUAL_IMPORT_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();

      // Pre-cargar los tipos de prueba ANUAL existentes por equipo para poder reiniciar
      // el cronómetro por cada tipo (LT/UTT/VT..., etc.) según lo que ya existe en el sistema.
      const tiposAnualPorEquipo = new Map();
      try {
        const snapAll = await db.collection('pruebas').get();
        snapAll.forEach(doc => {
          const data = doc.data() || {};
          const periodoStr = (data.periodo || '').toString().trim().toUpperCase();
          if (periodoStr && periodoStr !== 'ANUAL') return;
          const eq = (data.equipo || data.equipoId || data.activo || data['EQUIPO / ACTIVO'] || '').toString().trim();
          if (!eq) return;
          const tipo = normPruebaKey(data.pruebaTipo || data.prueba || 'ANUAL');
          const ek = normEquipoKey(eq);
          if (!ek) return;
          const set = tiposAnualPorEquipo.get(ek) || new Set();
          set.add(tipo || 'ANUAL');
          tiposAnualPorEquipo.set(ek, set);
        });
      } catch {
        // si falla, seguimos y creamos como ANUAL únicamente
      }

      const csvUrl = (req.query.csvUrl || '').toString().trim();
      const body = req.body || {};
      const csvInline = (body && typeof body.csv === 'string') ? body.csv : '';

      let csvText = '';
      if (csvInline && csvInline.trim()) {
        csvText = csvInline;
      } else if (csvUrl) {
        const r = await fetch(csvUrl, { method: 'GET', headers: { 'cache-control': 'no-store' } });
        if (!r.ok) throw new Error(`No se pudo cargar csvUrl (${r.status})`);
        csvText = await r.text();
      } else {
        res.status(400).send('Missing csvUrl query param or {csv} body');
        return;
      }

      const rawLines = csvText.split(/\r?\n/);
      const lines = rawLines
        .map(l => (l ?? '').toString())
        .filter(l => l.trim() !== '');

      if (!lines.length) {
        res.status(400).send('CSV vacío');
        return;
      }

      let headerIdx = -1;
      let headers = [];
      for (let i = 0; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]).map(x => String(x || '').trim());
        const h = cols.join(' ').toUpperCase();
        if (h.includes('NO. ACTIVO') && h.includes('FECHA')) {
          headerIdx = i;
          headers = cols;
          break;
        }
      }
      if (headerIdx < 0) {
        res.status(400).send('No se encontró cabecera con NO. ACTIVO y FECHA');
        return;
      }

      const idxTipo = headers.findIndex(h => h.toUpperCase() === 'TIPO');
      const idxActivo = headers.findIndex(h => h.toUpperCase().includes('NO. ACTIVO'));
      const idxSerial = headers.findIndex(h => h.toUpperCase().includes('NO. SERIAL'));
      const idxReporte = headers.findIndex(h => h.toUpperCase().includes('REPORTE'));
      const idxFecha = headers.findIndex(h => h.toUpperCase() === 'FECHA');
      const idxObs = headers.findIndex(h => h.toUpperCase().includes('OBSERV'));

      if (idxActivo < 0 || idxFecha < 0) {
        res.status(400).send('Cabecera inválida: faltan columnas NO. ACTIVO o FECHA');
        return;
      }

      const porEquipo = new Map();
      const errores = [];

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const equipo = String(cols[idxActivo] || '').trim();
        if (!equipo) continue;
        const frStr = String(cols[idxFecha] || '').trim();
        const fr = parseFecha(frStr);
        if (!fr) {
          errores.push({ line: i + 1, equipo, reason: 'FECHA_INVALIDA', fecha: frStr });
          continue;
        }

        const keyEq = normEquipoKey(equipo);
        const prev = porEquipo.get(keyEq);
        if (!prev || (prev.fr && fr.getTime() > prev.fr.getTime())) {
          porEquipo.set(keyEq, {
            equipo,
            tipo: idxTipo >= 0 ? String(cols[idxTipo] || '').trim() : '',
            serial: idxSerial >= 0 ? String(cols[idxSerial] || '').trim() : '',
            noReporte: idxReporte >= 0 ? String(cols[idxReporte] || '').trim() : '',
            observaciones: idxObs >= 0 ? String(cols[idxObs] || '').trim() : '',
            fr,
            frStr,
            srcLine: i + 1,
          });
        }
      }

      const items = Array.from(porEquipo.values());
      if (!items.length) {
        res.status(400).json({ ok: false, message: 'No hubo filas válidas para importar', errores });
        return;
      }

      const importedAt = admin.firestore.FieldValue.serverTimestamp();
      const batchLimit = 400;
      let createdOrUpdated = 0;
      let batches = 0;

      for (let i = 0; i < items.length; i += batchLimit) {
        const chunk = items.slice(i, i + batchLimit);
        const batch = db.batch();
        chunk.forEach(it => {
          const equipoKey = normEquipoKey(it.equipo);
          const dayKey = fmtYYYYMMDD(it.fr);

          const tipos = tiposAnualPorEquipo.get(equipoKey);
          const listaTipos = (tipos && tipos.size) ? Array.from(tipos.values()) : ['ANUAL'];

          for (const tipo of listaTipos) {
            const tipoKey = normPruebaKey(tipo || 'ANUAL') || 'ANUAL';
            const docId = `panual1__${equipoKey}__${tipoKey}__${dayKey}`;
            const ref = db.collection('pruebas').doc(docId);

            const proxima = new Date(it.fr);
            proxima.setFullYear(proxima.getFullYear() + 1);
            proxima.setHours(0, 0, 0, 0);

            batch.set(ref, {
              equipo: it.equipo,
              periodo: 'ANUAL',
              pruebaTipo: tipoKey,
              fechaRealizacion: admin.firestore.Timestamp.fromDate(it.fr),
              proxima: !isNaN(proxima.getTime()) ? admin.firestore.Timestamp.fromDate(proxima) : null,
              noReporte: it.noReporte || '',
              numeroSerie: it.serial || '',
              serial: it.serial || '',
              tipoEquipo: it.tipo || '',
              observaciones: it.observaciones || '',
              importTag: 'panual1',
              importLine: it.srcLine,
              importSourceFecha: it.frStr,
              importAt: importedAt,
            }, { merge: true });
          }
        });

        await batch.commit();
        batches += 1;
        createdOrUpdated += chunk.length;
      }

      res.status(200).json({
        ok: true,
        mode: 'INSERT_DEDUP_MOST_RECENT',
        pruebaTipo: 'ANUAL',
        periodo: 'ANUAL',
        equiposInCsv: items.length,
        writes: createdOrUpdated,
        batches,
        errores,
      });
    } catch (err) {
      console.error('importPanual1 error:', err);
      res.status(500).send(err?.message || String(err));
    }
  }
);

export const sendAlertsManual = onRequest(
  {
    secrets: ['SMTP_PASS', 'SMTP_USER', 'ALERTS_RUN_KEY'],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-alerts-key') || '').toString();
      const expected = (process.env.ALERTS_RUN_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      const out = await calcularYEnviar({ testMode: false, force: true });
      res.status(200).json(out);
    } catch (err) {
      console.error('sendAlertsManual error:', err);
      res.status(500).send(err?.message || String(err));
    }
  }
);

export const scanMissingInspectionEvidence = onRequest(
  {
    secrets: ['EVID_SCAN_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-evid-scan-key') || '').toString();
      const expected = (process.env.EVID_SCAN_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();
      const bucket = admin.storage().bucket();

      const limitRaw = (req.query.limit || '').toString().trim();
      const limitN = limitRaw ? parseInt(limitRaw, 10) : 600;
      const limitFinal = (!limitN || Number.isNaN(limitN) || limitN < 1) ? 600 : Math.min(limitN, 3000);

      const sinceRaw = (req.query.since || '').toString().trim();
      const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
      const sinceDate = (!sinceRaw || Number.isNaN(sinceMs)) ? null : new Date(sinceMs);

      let q = db.collection('inspecciones').orderBy('creadoEn', 'desc').limit(limitFinal);
      if (sinceDate) {
        q = db.collection('inspecciones').where('creadoEn', '>=', sinceDate).orderBy('creadoEn', 'desc').limit(limitFinal);
      }

      const snap = await q.get();

      const existsCache = new Map();
      const fileExists = async (path) => {
        const p = String(path || '').trim();
        if (!p) return false;
        if (existsCache.has(p)) return !!existsCache.get(p);
        try {
          const [ok] = await bucket.file(p).exists();
          existsCache.set(p, !!ok);
          return !!ok;
        } catch {
          existsCache.set(p, false);
          return false;
        }
      };

      const buildCandidates = ({ inspId, localId, actId, name, pathDirecto }) => {
        const out = [];
        const pd = String(pathDirecto || '').trim();
        if (pd) out.push(pd);
        const nm = String(name || '').trim();
        if (!nm) return out;
        if (inspId) out.push(`inspecciones/${inspId}/${nm}`);
        if (localId) out.push(`inspecciones/${localId}/${nm}`);
        if (actId) out.push(`inspecciones/${actId}/${nm}`);
        return Array.from(new Set(out));
      };

      const okStr = (v) => (v == null ? '' : String(v));

      const missing = [];
      const stats = {
        inspected: 0,
        inspectedParams: 0,
        missingCount: 0,
        missingDocs: 0,
      };

      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const inspId = doc.id;
        const localId = okStr(data.localId).trim();
        const actId = okStr(data.actividadId).trim();
        const equipo = okStr(data.equipo).trim();
        const fecha = okStr(data.fecha || data.creadoEn).trim();
        const params = Array.isArray(data.parametros) ? data.parametros : [];

        stats.inspected += 1;
        let docHasMissing = false;

        const pushMissing = (payload) => {
          missing.push({
            inspId,
            equipo,
            fecha,
            linkView: `inspeccion.html?view=1&inspId=${encodeURIComponent(inspId)}`,
            linkEdit: `inspeccion.html?inspId=${encodeURIComponent(inspId)}`,
            ...payload,
          });
          docHasMissing = true;
          stats.missingCount += 1;
        };

        for (let i = 0; i < params.length; i++) {
          const p = params[i] || {};
          const nombre = okStr(p.nombre).trim();
          stats.inspectedParams += 1;

          const checkSlot = async ({ slot, evidenciaNombre, evidenciaPath }) => {
            const nm = okStr(evidenciaNombre).trim();
            const pd = okStr(evidenciaPath).trim();
            if (!nm && !pd) return;
            const cands = buildCandidates({ inspId, localId, actId, name: nm, pathDirecto: pd });
            for (const c of cands) {
              if (await fileExists(c)) return;
            }
            pushMissing({ tipo: 'parametro', parametro: nombre, idx: i, slot, evidenciaNombre: nm, evidenciaPath: pd, candidatos: cands });
          };

          await checkSlot({ slot: 1, evidenciaNombre: p.evidenciaNombre, evidenciaPath: p.evidenciaPath });
          await checkSlot({ slot: 2, evidenciaNombre: p.evidenciaNombre2, evidenciaPath: p.evidenciaPath2 });

          const by = (p.evidenciasPorDano && typeof p.evidenciasPorDano === 'object') ? p.evidenciasPorDano : null;
          if (by) {
            for (const danoKey of Object.keys(by)) {
              const ed = by[danoKey] || {};
              const dk = okStr(danoKey).trim().toUpperCase();
              const checkDanoSlot = async ({ slot, evidenciaNombre, evidenciaPath }) => {
                const nm = okStr(evidenciaNombre).trim();
                const pd = okStr(evidenciaPath).trim();
                if (!nm && !pd) return;
                const cands = buildCandidates({ inspId, localId, actId, name: nm, pathDirecto: pd });
                for (const c of cands) {
                  if (await fileExists(c)) return;
                }
                pushMissing({ tipo: 'dano', parametro: nombre, idx: i, dano: dk, slot, evidenciaNombre: nm, evidenciaPath: pd, candidatos: cands });
              };
              await checkDanoSlot({ slot: 1, evidenciaNombre: ed.evidenciaNombre, evidenciaPath: ed.evidenciaPath });
              await checkDanoSlot({ slot: 2, evidenciaNombre: ed.evidenciaNombre2, evidenciaPath: ed.evidenciaPath2 });
            }
          }
        }

        if (docHasMissing) stats.missingDocs += 1;
      }

      res.status(200).json({
        ok: true,
        stats,
        limit: limitFinal,
        since: sinceDate ? sinceDate.toISOString() : null,
        missing,
      });
    } catch (err) {
      console.error('scanMissingInspectionEvidence error:', err);
      res.status(500).send(err?.message || String(err));
    }
  }
);
