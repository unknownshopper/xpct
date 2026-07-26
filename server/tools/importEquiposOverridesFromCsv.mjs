import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    anilloCsv: path.resolve(__dirname, '../../docs/TUBERIA4206conanilloretenedor.csv'),
    insertosCsv: path.resolve(__dirname, '../../docs/xINSERTOS.csv'),
    apply: false,
    limit: 0,
    batchSize: 450,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--anillo') args.anilloCsv = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--insertos') args.insertosCsv = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--limit') args.limit = Number(argv[++i] || '0') || 0;
    else if (a === '--batch') args.batchSize = Math.max(50, Math.min(450, Number(argv[++i] || '450') || 450));
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

function parseCSVLine(line) {
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
}

function normKey(s) {
  return String(s ?? '').trim().toUpperCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
}

function parseBool(val) {
  const v = String(val ?? '').trim().toUpperCase();
  if (!v) return null;
  if (v === 'SI' || v === 'S' || v === 'YES' || v === 'Y' || v === '1' || v === 'TRUE') return true;
  if (v === 'NO' || v === 'N' || v === '0' || v === 'FALSE') return false;
  return null;
}

function readOverridesFromAnilloCsv(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = String(txt || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return new Map();

  const header = parseCSVLine(lines[0]).map((x) => String(x || '').trim().toUpperCase());
  const idxActivo = header.indexOf('ACTIVO');
  const idxAnillo = header.indexOf('ANILLO RETENEDOR');
  if (idxActivo < 0 || idxAnillo < 0) return new Map();

  const m = new Map();
  for (const l of lines.slice(1)) {
    const cols = parseCSVLine(l);
    const activo = cols[idxActivo] || '';
    const anillo = cols[idxAnillo] || '';
    const k = normKey(activo);
    const b = parseBool(anillo);
    if (!k || b === null) continue;
    m.set(k, b);
  }
  return m;
}

function readOverridesFromInsertosCsv(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = String(txt || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return new Map();

  const header = parseCSVLine(lines[0]).map((x) => String(x || '').trim().toUpperCase());
  const idxActivo = header.indexOf('ACTIVO');
  const idxFlag = header.indexOf('INSERTOS Y ANILLO RETENEDOR');
  if (idxActivo < 0 || idxFlag < 0) return new Map();

  const m = new Map();
  for (const l of lines.slice(1)) {
    const cols = parseCSVLine(l);
    const activo = cols[idxActivo] || '';
    const flag = cols[idxFlag] || '';
    const k = normKey(activo);
    const b = parseBool(flag);
    if (!k || b === null) continue;
    m.set(k, b);
  }
  return m;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const anilloMap = readOverridesFromAnilloCsv(args.anilloCsv);
  const insertosMap = readOverridesFromInsertosCsv(args.insertosCsv);

  const keys = new Set([...anilloMap.keys(), ...insertosMap.keys()]);
  const rows = Array.from(keys.values()).map((k) => ({
    k,
    tieneAnilloRetenedor: anilloMap.has(k) ? anilloMap.get(k) : null,
    tieneInsertos: insertosMap.has(k) ? insertosMap.get(k) : null,
  }));

  console.log('Anillo rows:', anilloMap.size);
  console.log('Insertos rows:', insertosMap.size);
  console.log('Keys union:', rows.length);

  if (args.limit && args.limit > 0) {
    rows.splice(args.limit);
    console.log('Limit aplicado:', rows.length);
  }

  if (!args.apply) {
    console.log('DRY-RUN: no se escribió nada. Usa --apply para escribir en Firestore.');
    console.table(rows.slice(0, 15));
    return;
  }

  ensureAdmin();
  const db = admin.firestore();

  let written = 0;
  const batchSize = args.batchSize || 450;

  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const batch = db.batch();

    for (const r of slice) {
      const ref = db.collection('equipos_overrides').doc(r.k);
      const payload = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'csv_migracion',
      };
      if (typeof r.tieneAnilloRetenedor === 'boolean') payload.tieneAnilloRetenedor = r.tieneAnilloRetenedor;
      if (typeof r.tieneInsertos === 'boolean') payload.tieneInsertos = r.tieneInsertos;

      batch.set(ref, payload, { merge: true });
    }

    await batch.commit();
    written += slice.length;
    console.log('Written:', written);
  }

  console.log('DONE. total written:', written);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
