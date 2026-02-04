import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    csv: path.resolve(__dirname, '../../docs/unifi.csv'),
    apply: false,
    keepLt: false,
    onlyVpmUtt: false,
    noRepPrefix: '',
    pageSize: 400,
    sleepMs: 250,
    limit: 0,
    sample: 20,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') args.csv = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--keep-lt') args.keepLt = true;
    else if (a === '--only-vpm-utt') args.onlyVpmUtt = true;
    else if (a === '--norep-prefix') args.noRepPrefix = String(argv[++i] || '');
    else if (a === '--page-size') args.pageSize = Math.max(50, Math.min(1000, Number(argv[++i] || '400') || 400));
    else if (a === '--sleep-ms') args.sleepMs = Math.max(0, Number(argv[++i] || '250') || 250);
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
  const lines = text.split(/\r?\n/);
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
  const rows = lines.slice(1).filter((l) => l.trim() !== '').map((l) => parseLine(l));
  return { headers, rows };
}

function norm(val) {
  return String(val ?? '').trim().toUpperCase();
}

function normalizeNoReporte(val) {
  return norm(val).replace(/[·•–—]/g, '-');
}

function normalizePrueba(val) {
  const v = norm(val);
  if (!v) return '';
  const compact = v.replace(/\s+/g, '');
  if (compact.includes('VT') && compact.includes('PT') && compact.includes('MT') && !compact.includes('UTT') && !compact.includes('LT')) return 'VT/PT/MT';
  return v;
}

function buildKeyFromFields({ equipo, serial, periodo, prueba, fechaRealizacion, noReporte, area }) {
  const parts = [
    norm(equipo),
    norm(serial),
    norm(periodo),
    normalizePrueba(prueba),
    norm(fechaRealizacion),
    normalizeNoReporte(noReporte),
    norm(area),
  ];
  return parts.join('|');
}

function categoriaFromPrueba(prueba) {
  const p = normalizePrueba(prueba);
  if (!p) return '';
  if (p.includes('UTT')) return 'utt';
  if (p.includes('LT')) return 'lt';
  if (p.includes('VT') || p.includes('PT') || p.includes('MT')) return 'vpm';
  return '';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isQuotaErr(e) {
  try {
    const code = e && (e.code ?? e.status);
    if (code === 8 || code === 'RESOURCE_EXHAUSTED') return true;
    const msg = String(e?.message || '').toLowerCase();
    return msg.includes('resource_exhausted') || msg.includes('quota');
  } catch {
    return false;
  }
}

function upperBoundPrefix(prefix) {
  // Para rangos lexicográficos: [prefix, prefixUpper)
  // Ej: 'ABC' => 'ABD'
  if (!prefix) return '';
  const s = String(prefix);
  const last = s.charCodeAt(s.length - 1);
  if (!Number.isFinite(last)) return s + '\uf8ff';
  return s.slice(0, -1) + String.fromCharCode(last + 1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.csv)) {
    console.error('CSV no encontrado:', args.csv);
    process.exit(1);
  }

  const csvText = fs.readFileSync(args.csv, 'utf8');
  const { headers, rows } = parseCsv(csvText);

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const required = ['equipo', 'numeroSerie', 'periodo', 'prueba', 'fechaRealizacion', 'noReporte'];
  const missing = required.filter((h) => !(h in idx));
  if (missing.length) {
    console.error('Encabezados requeridos faltantes en CSV:', missing.join(', '));
    console.error('Headers encontrados:', headers.join(','));
    process.exit(1);
  }

  const csvKeys = new Set();
  let csvCount = 0;

  for (const r of rows) {
    const get = (h) => (idx[h] >= 0 ? String(r[idx[h]] ?? '').trim() : '');
    const equipo = get('equipo');
    const serial = get('numeroSerie');
    const periodo = get('periodo');
    const prueba = get('prueba');
    const fr = get('fechaRealizacion');
    const nr = get('noReporte');
    const area = get('areaPrueba') || get('area') || '';

    const k = buildKeyFromFields({ equipo, serial, periodo, prueba, fechaRealizacion: fr, noReporte: nr, area });
    if (!k) continue;
    csvKeys.add(k);
    csvCount++;
  }

  console.log('CSV:', args.csv);
  console.log('CSV filas (no vacías):', rows.length);
  console.log('CSV keys únicos:', csvKeys.size);

  ensureAdmin();
  const db = admin.firestore();

  // Por defecto, si vas a borrar solo VPM/UTT, filtra por el universo que más ruido mete.
  const defaultPrefix = args.onlyVpmUtt ? 'GIM-REP-PCT' : '';
  const prefix = (args.noRepPrefix || defaultPrefix || '').trim();
  if (prefix) console.log('Filtro noReporte prefix:', prefix);

  const extras = [];
  const counts = { kept: 0, extra: 0, extra_lt: 0, extra_vpm: 0, extra_utt: 0, extra_other: 0 };

  let readDocs = 0;
  let last = null;
  let done = false;
  let attempts = 0;

  while (!done) {
    let q = db.collection('pruebas');
    if (prefix) {
      const end = upperBoundPrefix(prefix);
      q = q.where('noReporte', '>=', prefix).where('noReporte', '<', end);
    }
    q = q.orderBy('noReporte').limit(args.pageSize);
    if (last) q = q.startAfter(last);

    let page;
    try {
      page = await q.get();
      attempts = 0;
    } catch (e) {
      if (isQuotaErr(e) && attempts < 10) {
        attempts++;
        const wait = Math.min(15_000, 500 * Math.pow(2, attempts));
        console.warn(`Quota exceeded. Reintentando en ${wait}ms (intento ${attempts}/10)`);
        await sleep(wait);
        continue;
      }
      throw e;
    }

    if (!page || page.empty) {
      done = true;
      break;
    }

    for (const doc of page.docs) {
      readDocs++;
      const d = doc.data() || {};
      const equipo = d.equipo || d.equipoId || d.activo || '';
      const serial = d.serial || d.numeroSerie || '';
      const periodo = d.periodo || '';
      const prueba = d.prueba || d.pruebaTipo || '';
      const fr = d.fechaRealizacion || d.fecha || '';
      const nr = d.noReporte || '';
      const area = d.area || d.areaPrueba || '';

      const k = buildKeyFromFields({ equipo, serial, periodo, prueba, fechaRealizacion: fr, noReporte: nr, area });
      if (csvKeys.has(k)) {
        counts.kept++;
        continue;
      }

      const cat = categoriaFromPrueba(prueba);

      if (args.keepLt && cat === 'lt') {
        counts.kept++;
        continue;
      }

      if (args.onlyVpmUtt && !(cat === 'vpm' || cat === 'utt')) {
        counts.kept++;
        continue;
      }

      counts.extra++;
      if (cat === 'lt') counts.extra_lt++;
      else if (cat === 'vpm') counts.extra_vpm++;
      else if (cat === 'utt') counts.extra_utt++;
      else counts.extra_other++;

      extras.push({ id: doc.id, equipo: String(equipo), serial: String(serial), periodo: String(periodo), prueba: String(prueba), noReporte: String(nr), area: String(area) });
    }

    last = page.docs[page.docs.length - 1];
    if (args.sleepMs) await sleep(args.sleepMs);

    if (args.limit && args.limit > 0 && readDocs >= args.limit) {
      console.log('Stop por limit de lectura (--limit):', readDocs);
      done = true;
    }
  }

  console.log('Firestore docs leídos:', readDocs);

  // Normalización de salida: keepLt/onlyVpmUtt son filtros de eliminación, no de lectura.
  // Si quieres leer TODO Firestore, no uses --norep-prefix ni --only-vpm-utt.

  // Procesamiento terminado

  console.log('--- Reconciliación ---');
  console.log('kept:', counts.kept);
  console.log('extra:', counts.extra);
  console.log('extra breakdown:', {
    lt: counts.extra_lt,
    vpm: counts.extra_vpm,
    utt: counts.extra_utt,
    other: counts.extra_other,
  });

  if (args.sample && extras.length) {
    console.log('sample extras:');
    console.table(extras.slice(0, args.sample));
  }

  if (!args.apply) {
    console.log('DRY-RUN: no se eliminó nada. Usa --apply para borrar.');
    return;
  }

  if (!extras.length) {
    console.log('Nada que eliminar.');
    return;
  }

  const limit = args.limit && args.limit > 0 ? Math.min(args.limit, extras.length) : extras.length;
  console.log(`Aplicando eliminación: ${limit} docs (batch <= 450)`);

  let deleted = 0;
  const chunkSize = 450;
  for (let i = 0; i < limit; i += chunkSize) {
    const slice = extras.slice(i, i + chunkSize);
    const batch = db.batch();
    slice.forEach((x) => batch.delete(db.collection('pruebas').doc(x.id)));
    await batch.commit();
    deleted += slice.length;
    console.log('deleted:', deleted);
  }

  console.log('DONE. deleted:', deleted);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
