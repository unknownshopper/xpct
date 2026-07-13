import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    csv: path.resolve(__dirname, '../../docs/INVENTARIOTOTAL04-202602.fixed.tee001-006.csv'),
    equipo: '',
    apply: false,
    limit: 0,
    sample: 20,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') args.csv = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--equipo') args.equipo = String(argv[++i] || '').trim();
    else if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--limit') args.limit = Number(argv[++i] || '0') || 0;
    else if (a === '--sample') args.sample = Number(argv[++i] || '20') || 20;
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

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => String(l || '').trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };

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

  const headers = parseLine(lines[0]).map((h) => String(h || '').trim());
  const rows = lines.slice(1).map((l) => parseLine(l));
  return { headers, rows };
}

function normEquipoKey(v) {
  let t = String(v || '');
  t = t.replace(/\u00A0/g, ' ');
  t = t.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  return t.toUpperCase().trim();
}

function pickCol(idx, cols) {
  if (!Number.isInteger(idx) || idx < 0) return '';
  return idx < cols.length ? String(cols[idx] || '').trim() : '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.equipo) {
    console.error('Falta --equipo PCT-TEE-027');
    process.exit(1);
  }

  if (!fs.existsSync(args.csv)) {
    console.error('CSV no encontrado:', args.csv);
    process.exit(1);
  }

  const csvText = fs.readFileSync(args.csv, 'utf8');
  const { headers, rows } = parseCsv(csvText);
  if (!headers.length || !rows.length) {
    console.error('CSV vacío o no parseable:', args.csv);
    process.exit(1);
  }

  const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
  const idxSerial = headers.indexOf('SERIAL');
  const idxProducto = headers.indexOf('PRODUCTO');
  const idxDesc = headers.indexOf('DESCRIPCION');
  const idxTipoEquipo = headers.indexOf('TIPO EQUIPO');
  const idxEdo = headers.indexOf('EDO');

  if (idxEquipo < 0) {
    console.error('No se encontró columna EQUIPO / ACTIVO en CSV');
    process.exit(1);
  }

  const equipoKey = normEquipoKey(args.equipo);
  const invRow = rows.find((cols) => normEquipoKey(pickCol(idxEquipo, cols)) === equipoKey) || null;

  if (!invRow) {
    console.error('Equipo no encontrado en inventario CSV:', args.equipo);
    process.exit(1);
  }

  const inv = {
    equipo: args.equipo,
    equipoKey,
    serial: pickCol(idxSerial, invRow),
    producto: pickCol(idxProducto, invRow),
    descripcion: pickCol(idxDesc, invRow),
    tipoEquipo: pickCol(idxTipoEquipo, invRow),
    edo: pickCol(idxEdo, invRow),
  };

  console.log('Inventario:', inv);

  ensureAdmin();
  const db = admin.firestore();

  const snap = await db.collection('pruebas').get();
  const matches = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const eqRaw = String(data.equipo || data.equipoId || data.activo || '').trim();
    if (!eqRaw) return;
    const eqKey = normEquipoKey(eqRaw);
    if (eqKey !== equipoKey) return;

    const patch = {};
    if (inv.serial && String(data.serial || '').trim() !== inv.serial) patch.serial = inv.serial;
    if (inv.producto && String(data.producto || '').trim() !== inv.producto) patch.producto = inv.producto;
    if (inv.descripcion && String(data.descripcion || '').trim() !== inv.descripcion) patch.descripcion = inv.descripcion;
    if (inv.tipoEquipo && String(data.tipoEquipo || '').trim() !== inv.tipoEquipo) patch.tipoEquipo = inv.tipoEquipo;
    if (inv.edo && String(data.edo || '').trim().toUpperCase() !== String(inv.edo || '').trim().toUpperCase()) patch.edo = inv.edo;

    matches.push({ id: doc.id, equipo: eqRaw, patch, before: { serial: data.serial || '', producto: data.producto || '', descripcion: data.descripcion || '', tipoEquipo: data.tipoEquipo || '', edo: data.edo || '' } });
  });

  const toUpdate = matches.filter((m) => m && m.patch && Object.keys(m.patch).length > 0);

  console.log('Docs pruebas encontrados para equipo:', matches.length);
  console.log('Docs con cambios necesarios:', toUpdate.length);

  if (args.sample > 0) {
    console.log('Sample:');
    toUpdate.slice(0, args.sample).forEach((m) => {
      console.log('-', m.id, { before: m.before, patch: m.patch });
    });
  }

  const limited = args.limit > 0 ? toUpdate.slice(0, args.limit) : toUpdate;

  if (!args.apply) {
    console.log('DRY-RUN: no se aplicaron cambios. Usa --apply para aplicar.');
    return;
  }

  if (!limited.length) {
    console.log('Nada que actualizar.');
    return;
  }

  const batch = db.batch();
  limited.forEach((m) => {
    const ref = db.collection('pruebas').doc(m.id);
    batch.update(ref, m.patch);
  });
  await batch.commit();
  console.log('OK: actualizados', limited.length, 'docs en pruebas');

  if (args.limit > 0 && args.limit < toUpdate.length) {
    console.log('Nota: se aplicó --limit', args.limit, 'de', toUpdate.length);
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
