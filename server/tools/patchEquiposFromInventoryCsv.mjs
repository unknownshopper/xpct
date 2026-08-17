import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    csv: path.resolve(__dirname, '../../docs/INVENTARIOTOTAL04-202602.csv'),
    from: 'PCT-90-290',
    to: 'PCT-90-301',
    apply: false,
    batchSize: 450,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') args.csv = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--from') args.from = String(argv[++i] || '').trim();
    else if (a === '--to') args.to = String(argv[++i] || '').trim();
    else if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
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

function normEquipoKey(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u200B-\u200D\uFEFF]+/g, '')
    .replace(/\s+/g, ' ');
}

function parseNumSuffix(key) {
  // Espera formato PCT-90-290
  const m = String(key || '').toUpperCase().match(/^PCT-[A-Z0-9]+-(\d{1,4})$/);
  if (!m) return NaN;
  return Number(m[1]);
}

function inRangeEquipo(key, fromKey, toKey) {
  const famKey = (k) => {
    const parts = String(k || '').toUpperCase().split('-').filter(Boolean);
    return parts.length >= 2 ? parts[1] : '';
  };
  const aFam = famKey(key);
  if (!aFam) return false;
  if (aFam !== famKey(fromKey) || aFam !== famKey(toKey)) return false;
  const n = parseNumSuffix(key);
  const a = parseNumSuffix(fromKey);
  const b = parseNumSuffix(toKey);
  if (!Number.isFinite(n) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return n >= lo && n <= hi;
}

function getIdx(headers, name) {
  return headers.indexOf(name);
}

function getCol(cols, idx) {
  if (idx < 0 || idx >= cols.length) return '';
  return String(cols[idx] || '').trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = args.csv;
  if (!fs.existsSync(csvPath)) {
    console.error('CSV no existe:', csvPath);
    process.exit(1);
  }

  const txt = fs.readFileSync(csvPath, 'utf8');
  const lines = String(txt || '').split(/\r?\n/).filter((l) => String(l || '').trim() !== '');
  if (!lines.length) {
    console.error('CSV vacío');
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]).map((h) => String(h || '').trim());

  const idxEquipo = getIdx(headers, 'EQUIPO / ACTIVO');
  const idxSerial = getIdx(headers, 'SERIAL');
  const idxDesc = getIdx(headers, 'DESCRIPCION');
  const idxReporte = getIdx(headers, 'REPORTE P/P');
  const idxProp = getIdx(headers, 'PROPIEDAD');
  const idxProducto = getIdx(headers, 'PRODUCTO');
  const idxAcero = getIdx(headers, 'ACERO');
  const idxTipoEquipo = getIdx(headers, 'TIPO EQUIPO');
  const idxEdo = getIdx(headers, 'EDO');
  const idxDiam1 = getIdx(headers, 'DIAMETRO 1');
  const idxTipo1 = getIdx(headers, 'TIPO 1');
  const idxCon1 = getIdx(headers, 'CONEXIÓN 1');
  const idxPres1 = getIdx(headers, 'PRESION 1');
  const idxX1 = getIdx(headers, 'X 1');
  const idxDiam2 = getIdx(headers, 'DIAMETRO 2');
  const idxTipo2 = getIdx(headers, 'TIPO 2');
  const idxCon2 = getIdx(headers, 'CONEXIÓN 2');
  const idxPres2 = getIdx(headers, 'PRESION 2');
  const idxX2 = getIdx(headers, 'X 2');
  const idxDiam3 = getIdx(headers, 'DIAMETRO 3');
  const idxTipo3 = getIdx(headers, 'TIPO 3');
  const idxCon3 = getIdx(headers, 'CONEXIÓN 3');
  const idxPres3 = getIdx(headers, 'PRESION 3');
  const idxPT = getIdx(headers, 'P.T.');
  const idxServicio = getIdx(headers, 'SERVICIO');
  const idxAL = getIdx(headers, 'A / L');
  const idxTemp = getIdx(headers, 'TEMP');
  const idxFlejeCompleta = getIdx(headers, 'INFORMACION FLEJE COMPLETA');
  const idxFleje = getIdx(headers, 'INFORMACION FLEJE');

  if (idxEquipo < 0) {
    console.error('Cabecera inválida: falta columna EQUIPO / ACTIVO');
    process.exit(1);
  }

  const fromKey = normEquipoKey(args.from);
  const toKey = normEquipoKey(args.to);

  const hitRows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const equipoRaw = getCol(cols, idxEquipo);
    const equipoKey = normEquipoKey(equipoRaw);
    if (!equipoKey) continue;
    if (!inRangeEquipo(equipoKey, fromKey, toKey)) continue;

    hitRows.push({
      lineNo: i + 1,
      equipoKey,
      equipoDisplay: equipoRaw,
      cols,
    });
  }

  hitRows.sort((a, b) => String(a.equipoKey).localeCompare(String(b.equipoKey), 'es'));

  const patches = hitRows.map((r) => {
    const cols = r.cols;
    const payload = {
      version: 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'patch_inventory_csv',
      equipoKey: r.equipoKey,
      equipoDisplay: r.equipoDisplay,
      serial: getCol(cols, idxSerial),
      descripcion: getCol(cols, idxDesc),
      reportePP: getCol(cols, idxReporte),
      propiedad: getCol(cols, idxProp),
      producto: getCol(cols, idxProducto),
      acero: getCol(cols, idxAcero),
      tipoEquipo: getCol(cols, idxTipoEquipo),
      edo: getCol(cols, idxEdo),
      diametro1: getCol(cols, idxDiam1),
      tipo1: getCol(cols, idxTipo1),
      conexion1: getCol(cols, idxCon1),
      presion1: getCol(cols, idxPres1),
      x1: getCol(cols, idxX1),
      diametro2: getCol(cols, idxDiam2),
      tipo2: getCol(cols, idxTipo2),
      conexion2: getCol(cols, idxCon2),
      presion2: getCol(cols, idxPres2),
      x2: getCol(cols, idxX2),
      diametro3: getCol(cols, idxDiam3),
      tipo3: getCol(cols, idxTipo3),
      conexion3: getCol(cols, idxCon3),
      presion3: getCol(cols, idxPres3),
      pt: getCol(cols, idxPT),
      servicio: getCol(cols, idxServicio),
      al: getCol(cols, idxAL),
      temp: getCol(cols, idxTemp),
      infoFlejeCompleta: getCol(cols, idxFlejeCompleta),
      infoFleje: getCol(cols, idxFleje),
      __src: { csvPath: path.basename(csvPath), lineNo: r.lineNo },
    };
    return payload;
  });

  console.log('CSV:', csvPath);
  console.log('Range:', fromKey, '->', toKey);
  console.log('Rows found:', hitRows.length);
  console.table(
    patches.map((p) => ({
      equipoKey: p.equipoKey,
      serial: p.serial,
      edo: p.edo,
      producto: p.producto,
      descLen: String(p.descripcion || '').length,
      lineNo: (p.__src && p.__src.lineNo) ? p.__src.lineNo : '',
    }))
  );

  if (!args.apply) {
    console.log('DRY-RUN: no se escribió nada. Usa --apply para escribir en Firestore.');
    return;
  }

  ensureAdmin();
  const db = admin.firestore();

  let written = 0;
  const batchSize = args.batchSize || 450;

  for (let i = 0; i < patches.length; i += batchSize) {
    const slice = patches.slice(i, i + batchSize);
    const batch = db.batch();

    for (const p of slice) {
      const ref = db.collection('equipos').doc(String(p.equipoKey));
      batch.set(ref, p, { merge: true });
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
