import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    invre: path.resolve(__dirname, '../../docs/invre.csv'),
    out: path.resolve(process.cwd(), `wip_mismatch_report_${new Date().toISOString().slice(0, 10)}.csv`),
    outJson: path.resolve(process.cwd(), `wip_mismatch_report_${new Date().toISOString().slice(0, 10)}.json`),
    pageSize: 500,
    sleepMs: 200,
    limitWip: 0,
    suggest: 5,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--invre') args.invre = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--out') args.out = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--out-json') args.outJson = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--page-size') args.pageSize = Math.max(50, Math.min(1000, Number(argv[++i] || '500') || 500));
    else if (a === '--sleep-ms') args.sleepMs = Math.max(0, Number(argv[++i] || '200') || 200);
    else if (a === '--limit-wip') args.limitWip = Number(argv[++i] || '0') || 0;
    else if (a === '--suggest') args.suggest = Math.max(0, Number(argv[++i] || '5') || 5);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inside = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"') {
        if (inside && next === '"') {
          cur += '"';
          i++;
        } else {
          inside = !inside;
        }
      } else if (ch === ',' && !inside) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]).map((h) => String(h || '').trim());
  for (const line of lines.slice(1)) {
    if (!line || !line.trim()) continue;
    rows.push(parseLine(line));
  }
  return { headers, rows };
}

function normKey(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '')
    .replace(/[“”"'´`]/g, '');
}

function normRaw(s) {
  return String(s || '').trim().toUpperCase();
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function levenshtein(a, b, max = 8) {
  // Simple Levenshtein with early cutoff.
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  const n = s.length;
  const m = t.length;
  if (!n) return m;
  if (!m) return n;
  if (Math.abs(n - m) > max) return max + 1;

  const v0 = new Array(m + 1);
  const v1 = new Array(m + 1);
  for (let j = 0; j <= m; j++) v0[j] = j;

  for (let i = 0; i < n; i++) {
    v1[0] = i + 1;
    let minRow = v1[0];
    for (let j = 0; j < m; j++) {
      const cost = s[i] === t[j] ? 0 : 1;
      const del = v0[j + 1] + 1;
      const ins = v1[j] + 1;
      const sub = v0[j] + cost;
      const val = Math.min(del, ins, sub);
      v1[j + 1] = val;
      if (val < minRow) minRow = val;
    }
    if (minRow > max) return max + 1;
    for (let j = 0; j <= m; j++) v0[j] = v1[j];
  }
  return v0[m];
}

async function loadPruebasIndex({ pageSize, sleepMs }) {
  ensureAdmin();
  const db = admin.firestore();

  const equiposRawSet = new Set();
  const serialsRawSet = new Set();

  const equiposNormToRaw = new Map(); // norm -> Set(raw)
  const serialNormToRaw = new Map();

  let last = null;
  let totalDocs = 0;

  while (true) {
    let q = db.collection('pruebas').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);

    let snap;
    try {
      snap = await q.get();
    } catch (err) {
      // Backoff simple
      await sleep(Math.min(5000, sleepMs * 10));
      snap = await q.get();
    }

    if (!snap.size) break;
    totalDocs += snap.size;

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const eqRaw = normRaw(data.equipo || '');
      const snRaw = normRaw(data.serial || data.numeroSerie || '');

      if (eqRaw) {
        equiposRawSet.add(eqRaw);
        const nk = normKey(eqRaw);
        if (nk) {
          if (!equiposNormToRaw.has(nk)) equiposNormToRaw.set(nk, new Set());
          equiposNormToRaw.get(nk).add(eqRaw);
        }
      }

      if (snRaw) {
        serialsRawSet.add(snRaw);
        const nk = normKey(snRaw);
        if (nk) {
          if (!serialNormToRaw.has(nk)) serialNormToRaw.set(nk, new Set());
          serialNormToRaw.get(nk).add(snRaw);
        }
      }
    });

    last = snap.docs[snap.docs.length - 1];
    await sleep(sleepMs);
  }

  const equiposNormList = Array.from(equiposNormToRaw.keys());

  return {
    totalDocs,
    equiposRawSet,
    serialsRawSet,
    equiposNormToRaw,
    serialNormToRaw,
    equiposNormList,
  };
}

function suggestCandidates(targetNorm, equiposNormList, limit) {
  if (!limit) return [];
  const out = [];

  // Heurística rápida: priorizar mismos prefijos
  const prefix = targetNorm.slice(0, 6);
  const candidates = equiposNormList.filter((k) => k.startsWith(prefix));
  const pool = candidates.length ? candidates : equiposNormList;

  for (const cand of pool) {
    const dist = levenshtein(targetNorm, cand, 8);
    if (dist <= 8) out.push({ cand, dist });
  }
  out.sort((a, b) => a.dist - b.dist || a.cand.localeCompare(b.cand));
  return out.slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const invrePath = args.invre;

  if (!fs.existsSync(invrePath)) {
    throw new Error(`No existe invre.csv: ${invrePath}`);
  }

  const invreText = fs.readFileSync(invrePath, 'utf8');
  const { headers, rows } = parseCsv(invreText);

  const idxEdo = headers.indexOf('EDO');
  const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
  const idxSerial = headers.indexOf('SERIAL');

  if (idxEdo < 0 || idxEquipo < 0) {
    throw new Error(`No se encontraron headers requeridos. idxEDO=${idxEdo}, idxEquipo=${idxEquipo}. Headers: ${headers.join(',')}`);
  }

  const pruebasIndex = await loadPruebasIndex({ pageSize: args.pageSize, sleepMs: args.sleepMs });

  const wip = [];
  for (const cols of rows) {
    const edo = normRaw(cols[idxEdo] || '');
    if (edo !== 'WIP') continue;
    const equipo = normRaw(cols[idxEquipo] || '');
    const serial = idxSerial >= 0 ? normRaw(cols[idxSerial] || '') : '';
    wip.push({ edo, equipo, serial });
    if (args.limitWip && wip.length >= args.limitWip) break;
  }

  const resultRows = [];
  let cntEqExact = 0;
  let cntSnExact = 0;
  let cntEqNorm = 0;
  let cntSnNorm = 0;
  let cntNoMatch = 0;

  for (const rec of wip) {
    const eqRaw = rec.equipo;
    const snRaw = rec.serial;

    const eqExact = eqRaw && pruebasIndex.equiposRawSet.has(eqRaw);
    const snExact = snRaw && pruebasIndex.serialsRawSet.has(snRaw);

    const eqN = normKey(eqRaw);
    const snN = normKey(snRaw);

    const eqNormHits = eqN && pruebasIndex.equiposNormToRaw.has(eqN) ? Array.from(pruebasIndex.equiposNormToRaw.get(eqN)) : [];
    const snNormHits = snN && pruebasIndex.serialNormToRaw.has(snN) ? Array.from(pruebasIndex.serialNormToRaw.get(snN)) : [];

    if (eqExact) cntEqExact++;
    if (snExact) cntSnExact++;
    if (!eqExact && eqNormHits.length) cntEqNorm++;
    if (!snExact && snNormHits.length) cntSnNorm++;

    const hasAny = !!(eqExact || snExact || eqNormHits.length || snNormHits.length);
    if (!hasAny) cntNoMatch++;

    const sugg = hasAny ? [] : suggestCandidates(eqN, pruebasIndex.equiposNormList, args.suggest);

    resultRows.push({
      edo: rec.edo,
      invre_equipo: eqRaw,
      invre_serial: snRaw,
      match_equipo_exact: eqExact ? '1' : '0',
      match_serial_exact: snExact ? '1' : '0',
      match_equipo_norm: eqNormHits.length ? '1' : '0',
      match_serial_norm: snNormHits.length ? '1' : '0',
      equipo_norm_hits: eqNormHits.join('|'),
      serial_norm_hits: snNormHits.join('|'),
      suggest_norm_1: sugg[0]?.cand || '',
      suggest_dist_1: (sugg[0]?.dist ?? '').toString(),
      suggest_norm_2: sugg[1]?.cand || '',
      suggest_dist_2: (sugg[1]?.dist ?? '').toString(),
      suggest_norm_3: sugg[2]?.cand || '',
      suggest_dist_3: (sugg[2]?.dist ?? '').toString(),
      suggest_norm_4: sugg[3]?.cand || '',
      suggest_dist_4: (sugg[3]?.dist ?? '').toString(),
      suggest_norm_5: sugg[4]?.cand || '',
      suggest_dist_5: (sugg[4]?.dist ?? '').toString(),
    });
  }

  const outHeaders = [
    'edo',
    'invre_equipo',
    'invre_serial',
    'match_equipo_exact',
    'match_serial_exact',
    'match_equipo_norm',
    'match_serial_norm',
    'equipo_norm_hits',
    'serial_norm_hits',
    'suggest_norm_1',
    'suggest_dist_1',
    'suggest_norm_2',
    'suggest_dist_2',
    'suggest_norm_3',
    'suggest_dist_3',
    'suggest_norm_4',
    'suggest_dist_4',
    'suggest_norm_5',
    'suggest_dist_5',
  ];

  const csvLines = [outHeaders.join(',')];
  for (const r of resultRows) {
    csvLines.push(outHeaders.map((h) => csvEscape(r[h] ?? '')).join(','));
  }
  fs.writeFileSync(args.out, csvLines.join('\n'), 'utf8');

  const summary = {
    invrePath,
    firestoreDocsScanned: pruebasIndex.totalDocs,
    wipCount: wip.length,
    matchEquipoExact: cntEqExact,
    matchSerialExact: cntSnExact,
    matchEquipoNormOnly: cntEqNorm,
    matchSerialNormOnly: cntSnNorm,
    noMatch: cntNoMatch,
    outCsv: args.out,
  };
  fs.writeFileSync(args.outJson, JSON.stringify(summary, null, 2), 'utf8');

  // Output breve
  process.stdout.write(
    `WIP=${wip.length} | eqExact=${cntEqExact} | snExact=${cntSnExact} | eqNormOnly=${cntEqNorm} | snNormOnly=${cntSnNorm} | noMatch=${cntNoMatch}\n` +
      `CSV: ${args.out}\nJSON: ${args.outJson}\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
