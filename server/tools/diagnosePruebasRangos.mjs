import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    equipo: '', // opcional: filtra por equipo (display)
    equipos: '', // opcional: lista de equipos (display) separados por coma/espacio
    prueba: '', // opcional: filtra por pruebaTipo/prueba
    limitGroups: 50,
    includeAllDocs: false,
    showAllGroups: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--equipo') args.equipo = String(argv[++i] || '').trim();
    else if (a === '--equipos') args.equipos = String(argv[++i] || '').trim();
    else if (a === '--prueba') args.prueba = String(argv[++i] || '').trim();
    else if (a === '--limit-groups') args.limitGroups = Number(argv[++i] || '50') || 50;
    else if (a === '--include-all-docs') args.includeAllDocs = true;
    else if (a === '--show-all-groups') args.showAllGroups = true;
  }
  return args;
}

function ensureAdmin() {
  if (admin.apps.length) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const creds = JSON.parse(json);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    return;
  }
  const saPath = path.resolve(__dirname, '../serviceAccount.json');
  if (fs.existsSync(saPath)) {
    const creds = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    return;
  }
  admin.initializeApp();
}

function parseDDMMYY(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  if (t && typeof t === 'object' && typeof t.toDate === 'function') {
    const d = t.toDate();
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  if (t instanceof Date) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof s === 'number' && Number.isFinite(s)) {
    const d = new Date(s);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  if (t.includes('/')) {
    const [ddStr, mmStr, aaStr] = t.split('/');
    const dd = parseInt(ddStr, 10);
    const mm = parseInt(mmStr, 10);
    const aa = parseInt(aaStr, 10);
    if (!dd || !mm || Number.isNaN(aa)) return null;
    const year = aaStr.length <= 2 ? (2000 + aa) : aa;
    const d = new Date(year, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function parseProxima(v) {
  if (!v) return null;
  if (v && typeof v === 'object' && typeof v.toDate === 'function') {
    const d = v.toDate();
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) {
    const d = new Date(v);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  return parseDDMMYY(String(v || '').trim());
}

function normPruebaKey(v) {
  let t = String(v || '');
  t = t.replace(/\u00A0/g, ' ');
  t = t.replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ');
  t = t.toUpperCase().trim();
  if (!t) return 'ANUAL';
  const compact = t.replace(/\s+/g, '');
  let canon = t;
  if (compact.includes('VT') && compact.includes('PT') && compact.includes('MT') && !compact.includes('UTT') && !compact.includes('LT')) canon = 'VT/PT/MT';
  else if (compact.includes('UTT')) canon = 'UTT';
  else if (compact.includes('LT')) canon = 'LT';
  // canónica: solo alfanumérico
  return String(canon).replace(/[^A-Z0-9]/g, '');
}

function normEquipoKey(v) {
  let t = String(v || '');
  t = t.replace(/\u00A0/g, ' ');
  t = t.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  t = t.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-');
  t = t.toUpperCase().trim();
  t = t.replace(/[^A-Z0-9]/g, '');
  return t;
}

function fmtDate(d) {
  if (!d || isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function diasDesdeHoy(prox) {
  if (!prox || isNaN(prox.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((prox.getTime() - hoy.getTime()) / 86400000);
}

function pickWinner(docs) {
  // Regla: proxima efectiva más alta; desempate por fechaRealizacion; luego creado/imported.
  const scored = docs.map((d) => {
    const fr = parseDDMMYY(d.fechaRealizacion || d.fechaPrueba || d.fecha || '');
    let prox = parseProxima(d.proxima || '');
    if (!prox && fr) {
      const dd = new Date(fr);
      dd.setFullYear(dd.getFullYear() + 1);
      dd.setHours(0, 0, 0, 0);
      if (!isNaN(dd.getTime())) prox = dd;
    }
    const dueMs = prox ? prox.getTime() : 0;
    const frMs = fr ? fr.getTime() : 0;
    const cr = parseDDMMYY(d.creadoEn || d.createdAt || d.importedAt || d.fechaRegistro || '');
    const crMs = cr ? cr.getTime() : 0;
    return { d, prox, fr, dueMs, frMs, crMs };
  });

  scored.sort((a, b) => {
    if (a.dueMs !== b.dueMs) return b.dueMs - a.dueMs;
    if (a.frMs !== b.frMs) return b.frMs - a.frMs;
    return b.crMs - a.crMs;
  });

  return scored[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureAdmin();

  const db = admin.firestore();
  const snap = await db.collection('pruebas').get();

  const gruposObjetivo = new Set();
  try {
    const rawList = String(args.equipos || '').trim();
    if (rawList) {
      rawList
        .split(/[;,\n\r\t ]+/)
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .forEach((s) => {
          const k = normEquipoKey(s);
          if (k) gruposObjetivo.add(k);
        });
    }
  } catch {}

  const groups = new Map();

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const periodo = String(data.periodo || '').trim().toUpperCase();
    const esAnual = (periodo === 'ANUAL' || !periodo);
    if (!esAnual) return;

    const equipoDisp = String(data.equipo || '').trim();
    const pruebaDisp = String(data.pruebaTipo || data.prueba || 'ANUAL').trim();

    if (args.equipo && !equipoDisp.toUpperCase().includes(args.equipo.toUpperCase())) return;
    if (args.prueba && !pruebaDisp.toUpperCase().includes(args.prueba.toUpperCase())) return;

    const equipoKey = normEquipoKey(equipoDisp);
    const pruebaKey = normPruebaKey(pruebaDisp);
    if (!equipoKey || !pruebaKey) return;

    if (gruposObjetivo.size && !gruposObjetivo.has(equipoKey)) return;

    const key = `${equipoKey}__${pruebaKey}`;
    const arr = groups.get(key) || [];
    arr.push({ id: doc.id, ...data, _equipoDisp: equipoDisp, _pruebaDisp: pruebaDisp });
    groups.set(key, arr);
  });

  const conflicts = [];
  const winnersOnly = [];

  groups.forEach((docs, key) => {
    if (!docs || !docs.length) return;
    const winner = pickWinner(docs);
    if (!winner) return;

    const winDias = diasDesdeHoy(winner.prox);
    const hasVencidos = docs.some((d) => {
      const w = pickWinner([d]);
      const di = w ? diasDesdeHoy(w.prox) : null;
      return typeof di === 'number' && di <= 0;
    });

    // Reportar solo los que tienen mezcla (hay al menos uno vencido y el ganador es vigente) o si el ganador es vencido.
    const winnerIsVencida = (typeof winDias === 'number' && winDias <= 0);
    const mixed = hasVencidos && (typeof winDias === 'number' && winDias > 0);

    if (args.showAllGroups || gruposObjetivo.size) {
      winnersOnly.push({ key, docs, winner, mixed, winnerIsVencida, winDias });
    }
    if (!mixed && !winnerIsVencida) return;
    conflicts.push({ key, docs, winner, mixed, winnerIsVencida, winDias });
  });

  const sortByDias = (a, b) => (a.winDias ?? 999999) - (b.winDias ?? 999999);
  conflicts.sort(sortByDias);
  winnersOnly.sort(sortByDias);

  console.log('Total docs leídos:', snap.size);
  console.log('Grupos totales (equipo+prueba):', groups.size);
  console.log('Grupos con >1 doc:', Array.from(groups.values()).filter((x) => x.length > 1).length);
  console.log('Conflictos relevantes (mezcla vencido/vigente o ganador vencido):', conflicts.length);

  const base = (args.showAllGroups || gruposObjetivo.size) ? winnersOnly : conflicts;
  const top = args.limitGroups > 0 ? base.slice(0, args.limitGroups) : base;

  for (const c of top) {
    const w = c.winner;
    const win = w?.d || {};
    console.log('\n---');
    console.log('KEY:', c.key);
    console.log('FLAGS:', { mixed: !!c.mixed, winnerIsVencida: !!c.winnerIsVencida });
    console.log('WINNER:', {
      docId: win.id,
      equipo: win._equipoDisp || win.equipo,
      prueba: win._pruebaDisp || win.pruebaTipo || win.prueba,
      emisor: win.emisor || '',
      fechaRealizacion: win.fechaRealizacion || '',
      proxima: win.proxima || '',
      proximaParsed: fmtDate(w.prox),
      dias: c.winDias,
      creadoEn: win.creadoEn || win.importedAt || '',
    });

    if (args.includeAllDocs) {
      const rows = c.docs
        .map((d) => {
          const prox = parseProxima(d.proxima || '');
          const fr = parseDDMMYY(d.fechaRealizacion || d.fechaPrueba || d.fecha || '');
          const deriv = !prox && fr ? (() => {
            const x = new Date(fr);
            x.setFullYear(x.getFullYear() + 1);
            x.setHours(0, 0, 0, 0);
            return x;
          })() : null;
          const eff = prox || deriv;
          const di = eff ? diasDesdeHoy(eff) : null;
          return {
            id: d.id,
            equipo: d._equipoDisp || d.equipo,
            prueba: d._pruebaDisp || d.pruebaTipo || d.prueba,
            emisor: d.emisor || '',
            fr: d.fechaRealizacion || '',
            proxima: d.proxima || '',
            proximaEff: fmtDate(eff),
            dias: di,
            importBatchId: d.importBatchId || '',
          };
        })
        .sort((a, b) => (b.dias ?? -999999) - (a.dias ?? -999999));

      rows.forEach((r) => console.log('DOC:', r));
    }
  }

  console.log('\nOK');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
