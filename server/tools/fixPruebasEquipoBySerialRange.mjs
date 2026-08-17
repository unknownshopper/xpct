import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    from: 'PCT-90-278',
    to: 'PCT-90-290',
    apply: false,
    limit: 0,
    sample: 20,
    batchSize: 450,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') args.from = String(argv[++i] || '').trim();
    else if (a === '--to') args.to = String(argv[++i] || '').trim();
    else if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--limit') args.limit = Number(argv[++i] || '0') || 0;
    else if (a === '--sample') args.sample = Number(argv[++i] || '20') || 20;
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
  const m = String(key || '').toUpperCase().match(/^PCT-[A-Z0-9]+-(\d{1,4})$/);
  if (!m) return NaN;
  return Number(m[1]);
}

function famKey(k) {
  const parts = String(k || '').toUpperCase().split('-').filter(Boolean);
  return parts.length >= 2 ? parts[1] : '';
}

function inRangeEquipo(key, fromKey, toKey) {
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

function normSerial(v) {
  return String(v ?? '').trim().toUpperCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromKey = normEquipoKey(args.from);
  const toKey = normEquipoKey(args.to);
  if (!fromKey || !toKey) {
    console.error('Falta --from/--to');
    process.exit(1);
  }

  ensureAdmin();
  const db = admin.firestore();

  // 1) Cargar equipos del rango y construir mapa serial -> equipo
  const equiposSnap = await db.collection('equipos').get();
  const serialToEquipo = new Map();
  const equipoToInfo = new Map();

  equiposSnap.forEach((d) => {
    const equipoKey = normEquipoKey(d.id || '');
    if (!equipoKey) return;
    if (!inRangeEquipo(equipoKey, fromKey, toKey)) return;
    const data = d.data() || {};
    const serial = normSerial(data.serial || '');
    if (serial) serialToEquipo.set(serial, equipoKey);
    equipoToInfo.set(equipoKey, {
      equipoKey,
      serial,
      producto: String(data.producto || '').trim(),
      descripcion: String(data.descripcion || '').trim(),
      tipoEquipo: String(data.tipoEquipo || '').trim(),
    });
  });

  const serialKeys = Array.from(serialToEquipo.keys());
  console.log('Range:', fromKey, '->', toKey);
  console.log('Equipos in range:', equipoToInfo.size);
  console.log('Serials mapped:', serialToEquipo.size);
  if (!serialKeys.length) {
    console.log('No hay seriales mapeados. ¿Ya existe inventario en Firestore para ese rango?');
    return;
  }

  // 2) Escanear pruebas y corregir docs cuyo serial corresponde a un equipo distinto
  const pruebasSnap = await db.collection('pruebas').get();
  const candidates = [];

  pruebasSnap.forEach((doc) => {
    const data = doc.data() || {};
    const serial = normSerial(data.serial || data.numeroSerie || '');
    if (!serial) return;
    const targetEquipo = serialToEquipo.get(serial);
    if (!targetEquipo) return;

    const equipoRaw = String(data.equipo || data.equipoId || data.activo || '').trim();
    const equipoNow = normEquipoKey(equipoRaw);

    if (equipoNow === targetEquipo) return;

    const inv = equipoToInfo.get(targetEquipo) || null;
    const patch = {
      equipo: targetEquipo,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'fix_pruebas_equipo_by_serial',
      fixNote: `equipo corregido por serial=${serial}`,
    };

    if (inv) {
      if (inv.serial && normSerial(data.serial || data.numeroSerie || '') !== inv.serial) patch.serial = inv.serial;
      if (inv.producto && String(data.producto || '').trim() !== inv.producto) patch.producto = inv.producto;
      if (inv.descripcion && String(data.descripcion || '').trim() !== inv.descripcion) patch.descripcion = inv.descripcion;
      if (inv.tipoEquipo && String(data.tipoEquipo || '').trim() !== inv.tipoEquipo) patch.tipoEquipo = inv.tipoEquipo;
    }

    candidates.push({
      id: doc.id,
      serial,
      equipoBefore: equipoRaw,
      equipoAfter: targetEquipo,
      patch,
    });
  });

  console.log('Docs pruebas a corregir:', candidates.length);
  if (args.sample > 0) {
    console.log('Sample:');
    candidates.slice(0, args.sample).forEach((c) => {
      console.log('-', c.id, { serial: c.serial, equipoBefore: c.equipoBefore, equipoAfter: c.equipoAfter });
    });
  }

  const limited = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;

  if (!args.apply) {
    console.log('DRY-RUN: no se aplicaron cambios. Usa --apply para aplicar.');
    return;
  }

  if (!limited.length) {
    console.log('Nada que actualizar.');
    return;
  }

  let written = 0;
  const batchSize = args.batchSize || 450;
  for (let i = 0; i < limited.length; i += batchSize) {
    const slice = limited.slice(i, i + batchSize);
    const batch = db.batch();
    slice.forEach((c) => {
      const ref = db.collection('pruebas').doc(c.id);
      batch.update(ref, c.patch);
    });
    await batch.commit();
    written += slice.length;
    console.log('Written:', written);
  }

  console.log('DONE. total written:', written);
  if (args.limit > 0 && args.limit < candidates.length) {
    console.log('Nota: se aplicó --limit', args.limit, 'de', candidates.length);
  }
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
