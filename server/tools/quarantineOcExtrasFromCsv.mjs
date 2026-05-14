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

async function main() {
  const args = parseArgs(process.argv);
  const csvPath = args.csv;
  const targetOc = norm(args.oc || '');
  const cliente = norm(args.cliente || '');
  const ubicacion = norm(args.ubicacion || '');
  const dryRun = args.dry === '1' || args.dry === 'true';

  if (!csvPath) throw new Error('Falta --csv');
  if (!targetOc) throw new Error('Falta --oc');
  if (!cliente) throw new Error('Falta --cliente');
  if (!ubicacion) throw new Error('Falta --ubicacion');

  await initAdmin();
  const db = admin.firestore();

  const txt = await fs.readFile(csvPath, 'utf8');
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');

  const header = csvParseLine(lines[0]).map(h => h.toLowerCase());
  const idx = (name) => header.indexOf(String(name).toLowerCase());
  const iEquipo = idx('no_serie');
  if (iEquipo < 0) throw new Error('CSV debe contener columna no_serie');

  const csvEquipos = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = csvParseLine(lines[i]);
    const eq = norm(cols[iEquipo]);
    if (eq) csvEquipos.add(eq);
  }

  const snap = await db.collection('actividades')
    .where('cliente', '==', cliente)
    .where('ubicacion', '==', ubicacion)
    .where('oc', '==', targetOc)
    .get();

  const all = [];
  snap.forEach(ds => {
    const d = ds.data() || {};
    all.push({
      id: ds.id,
      equipo: norm(d.equipo),
      serial: norm(d.serial),
      descripcion: norm(d.descripcion),
      oc: norm(d.oc),
      ubicacion: norm(d.ubicacion),
      cliente: norm(d.cliente),
    });
  });

  const extras = all.filter(r => r.equipo && !csvEquipos.has(r.equipo));
  const missing = Array.from(csvEquipos).filter(eq => !all.some(r => r.equipo === eq));

  const quarantineOc = `Q-${targetOc}-${Date.now()}`;

  const result = {
    ok: true,
    dryRun,
    csvPath,
    targetOc,
    cliente,
    ubicacion,
    inOcCount: all.length,
    csvEquipos: csvEquipos.size,
    extrasCount: extras.length,
    missingCount: missing.length,
    quarantineOc,
    extras: extras.slice(0, 50),
    missing: missing.slice(0, 50),
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (!extras.length) {
    process.stdout.write(`${JSON.stringify({ ...result, updated: 0 }, null, 2)}\n`);
    return;
  }

  let batch = db.batch();
  let c = 0;
  for (const e of extras) {
    batch.update(db.collection('actividades').doc(e.id), { oc: quarantineOc });
    c++;
    if (c % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();

  process.stdout.write(`${JSON.stringify({ ...result, updated: extras.length }, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
