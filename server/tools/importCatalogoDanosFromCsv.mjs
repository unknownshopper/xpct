import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    csv: path.resolve(__dirname, '../../docs/danos.csv'),
    apply: false,
    batchSize: 450,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') args.csv = path.resolve(process.cwd(), argv[++i] || '');
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

function normalizeKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.csv)) {
    console.error('CSV no encontrado:', args.csv);
    process.exit(1);
  }

  const txt = fs.readFileSync(args.csv, 'utf8');
  const lines = String(txt || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length <= 1) {
    console.error('CSV sin datos (solo header o vacío)');
    process.exit(1);
  }

  const header = parseCSVLine(lines[0]).map((h) => String(h || '').trim().toLowerCase());
  const idxParametro = header.indexOf('parametro');
  const idxOpciones = header.indexOf('opciones');
  if (idxParametro < 0 || idxOpciones < 0) {
    console.error('Header inválido. Se esperaban columnas: parametro, opciones');
    console.error('Header encontrado:', header.join(','));
    process.exit(1);
  }

  const rows = [];
  for (const l of lines.slice(1)) {
    const cols = parseCSVLine(l);
    const parametro = String(cols[idxParametro] || '').trim();
    const opcionesTxt = String(cols[idxOpciones] || '').trim();
    if (!parametro) continue;

    const opciones = opcionesTxt
      .split('|')
      .map((x) => x.trim())
      .filter(Boolean);

    const parametroKey = normalizeKey(parametro);
    if (!parametroKey) continue;

    rows.push({ parametroKey, parametro, opciones });
  }

  console.log('CSV:', args.csv);
  console.log('Rows:', rows.length);
  console.table(rows.slice(0, 15));

  if (!args.apply) {
    console.log('DRY-RUN: no se escribió nada. Usa --apply para escribir en Firestore.');
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
      const ref = db.collection('catalogo_danos').doc(r.parametroKey);
      batch.set(
        ref,
        {
          parametroKey: r.parametroKey,
          parametro: r.parametro,
          opciones: r.opciones,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'csv_migracion',
        },
        { merge: true }
      );
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
