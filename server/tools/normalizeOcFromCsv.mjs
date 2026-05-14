import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import admin from 'firebase-admin';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = '1';
    }
  }
  return out;
}

function csvParseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (!inQ) {
        if (cur === '') inQ = true;
        else cur += '"';
      } else {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      }
      continue;
    }
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => String(s ?? '').trim());
}

function norm(v) {
  return String(v || '').replace(/\u00A0/g, ' ').trim();
}

function isNumericOc(v) {
  const s = String(v || '').trim();
  return /^\d{6,}$/.test(s);
}

async function initAdmin() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const saPath = path.resolve(__dirname, '../serviceAccount.json');
  const saRaw = await fs.readFile(saPath, 'utf8');
  const serviceAccount = JSON.parse(saRaw);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const csvPath = args.csv || path.resolve(process.cwd(), '../../docs/ixachi86.csv');
  const forcedOc = norm(args.oc || '');
  const dryRun = args.dry === '1' || args.dry === 'true';

  await initAdmin();
  const db = admin.firestore();

  const txt = await fs.readFile(csvPath, 'utf8');
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');

  const header = csvParseLine(lines[0]).map(h => h.toLowerCase());
  const idx = (name) => header.indexOf(String(name).toLowerCase());

  const iCliente = idx('cliente');
  const iUbic = idx('ubicacion');
  const iNoSerie = idx('no_serie');
  if ([iCliente, iUbic, iNoSerie].some(x => x < 0)) {
    throw new Error(`CSV no contiene columnas requeridas (cliente, ubicacion, no_serie). Header=${header.join(',')}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = csvParseLine(lines[i]);
    const cliente = norm(cols[iCliente]);
    const ubicacion = norm(cols[iUbic]);
    const equipo = norm(cols[iNoSerie]);
    if (!cliente || !ubicacion || !equipo) continue;
    rows.push({ cliente, ubicacion, equipo });
  }

  // Leer docs existentes para estos equipos y obtener las OCs actuales
  const found = [];
  for (const r of rows) {
    const q = db.collection('actividades')
      .where('cliente', '==', r.cliente)
      .where('ubicacion', '==', r.ubicacion)
      .where('equipo', '==', r.equipo)
      .limit(5);
    const snap = await q.get();
    snap.forEach(ds => {
      const data = ds.data() || {};
      found.push({ id: ds.id, oc: norm(data.oc), cliente: r.cliente, ubicacion: r.ubicacion, equipo: r.equipo });
    });
  }

  if (!found.length) {
    throw new Error('No encontré actividades que coincidan con el CSV (por cliente+ubicacion+equipo).');
  }

  let targetOc = forcedOc;
  if (!targetOc) {
    const numeric = found.map(x => x.oc).filter(isNumericOc).sort((a, b) => Number(a) - Number(b));
    if (numeric.length) targetOc = numeric[0];
    else {
      const any = found.map(x => x.oc).filter(Boolean).sort();
      targetOc = any[0] || '';
    }
  }

  if (!targetOc) throw new Error('No pude inferir una OC objetivo. Pásala con --oc <valor>.');

  const toUpdate = found.filter(x => norm(x.oc) !== targetOc);

  const distinctOcs = Array.from(new Set(found.map(x => norm(x.oc)).filter(Boolean))).sort((a, b) => {
    const an = isNumericOc(a);
    const bn = isNumericOc(b);
    if (an && bn) return Number(a) - Number(b);
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return a.localeCompare(b);
  });

  const result = {
    ok: true,
    dryRun,
    csvPath,
    targetOc,
    distinctOcs,
    matchedDocs: found.length,
    willUpdate: toUpdate.length,
    sample: toUpdate.slice(0, 10),
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  // Batch updates (máx 500 ops por batch)
  let batch = db.batch();
  let c = 0;
  for (const d of toUpdate) {
    batch.update(db.collection('actividades').doc(d.id), { oc: targetOc });
    c++;
    if (c % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();

  process.stdout.write(`${JSON.stringify({ ...result, updated: toUpdate.length }, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
