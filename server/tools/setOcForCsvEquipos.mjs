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

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const csvPath = args.csv || path.resolve(process.cwd(), '../../docs/ixachi86.csv');
  const targetOc = norm(args.oc || '');
  const cliente = norm(args.cliente || '');
  const ubicacion = norm(args.ubicacion || '');
  const dryRun = args.dry === '1' || args.dry === 'true';

  if (!targetOc) throw new Error('Falta --oc <OC_INTERNA_OBJETIVO>');

  await initAdmin();
  const db = admin.firestore();

  const txt = await fs.readFile(csvPath, 'utf8');
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');

  const header = csvParseLine(lines[0]).map(h => h.toLowerCase());
  const idx = (name) => header.indexOf(String(name).toLowerCase());
  const iEquipo = idx('no_serie');
  const iCliente = idx('cliente');
  const iUbic = idx('ubicacion');
  if (iEquipo < 0) throw new Error('CSV debe contener columna no_serie');

  const equiposSet = new Set();
  const cliSet = new Set();
  const ubicSet = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = csvParseLine(lines[i]);
    const eq = norm(cols[iEquipo]);
    if (eq) equiposSet.add(eq);
    if (iCliente >= 0) {
      const c = norm(cols[iCliente]);
      if (c) cliSet.add(c);
    }
    if (iUbic >= 0) {
      const u = norm(cols[iUbic]);
      if (u) ubicSet.add(u);
    }
  }

  const equipos = Array.from(equiposSet);
  if (!equipos.length) throw new Error('No encontré equipos en CSV');

  const resolvedCliente = cliente || (cliSet.size === 1 ? Array.from(cliSet)[0] : '');
  const resolvedUbic = ubicacion || (ubicSet.size === 1 ? Array.from(ubicSet)[0] : '');

  // Consultas por chunks (Firestore IN max 30)
  const matches = [];
  for (const part of chunk(equipos, 30)) {
    let q = db.collection('actividades').where('equipo', 'in', part);
    if (resolvedCliente) q = q.where('cliente', '==', resolvedCliente);
    if (resolvedUbic) q = q.where('ubicacion', '==', resolvedUbic);
    const snap = await q.get();
    snap.forEach(ds => {
      const d = ds.data() || {};
      matches.push({
        id: ds.id,
        equipo: norm(d.equipo),
        cliente: norm(d.cliente),
        ubicacion: norm(d.ubicacion),
        ocActual: norm(d.oc),
      });
    });
  }

  if (!matches.length) {
    throw new Error(`No encontré actividades que coincidan con esos equipos${resolvedCliente ? ` + cliente=${resolvedCliente}` : ''}${resolvedUbic ? ` + ubicacion=${resolvedUbic}` : ''}.`);
  }

  const toUpdate = matches.filter(m => m.ocActual !== targetOc);

  const result = {
    ok: true,
    dryRun,
    csvPath,
    targetOc,
    cliente: resolvedCliente || null,
    ubicacion: resolvedUbic || null,
    equipos: equipos.length,
    matchedDocs: matches.length,
    willUpdate: toUpdate.length,
    sample: toUpdate.slice(0, 12),
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  // Batch updates
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
