import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    out: '',
    json: false,
    apply: false,
    applyUpdate: false,
    invCsv: path.resolve(__dirname, '../../docs/INVENTARIOTOTAL04-202602.csv'),
    pageSize: 400,
    sleepMs: 200,
    limit: 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--json') args.json = true;
    else if (a === '--apply') args.apply = true;
    else if (a === '--apply-update') args.applyUpdate = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--inv-csv') args.invCsv = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--page-size') args.pageSize = Math.max(50, Math.min(1000, Number(argv[++i] || '400') || 400));
    else if (a === '--sleep-ms') args.sleepMs = Math.max(0, Number(argv[++i] || '200') || 200);
    else if (a === '--limit') args.limit = Number(argv[++i] || '0') || 0;
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

function escCsv(v) {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildEquiposTargets() {
  const out = [];
  for (let i = 43; i <= 48; i++) {
    out.push(`PCT-TEE-${String(i).padStart(3, '0')}`);
  }
  return out;
}

function parseCsvLine(line) {
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

function loadInventarioMap(invCsvPath) {
  const map = new Map();
  try {
    if (!fs.existsSync(invCsvPath)) return map;
    const text = fs.readFileSync(invCsvPath, 'utf8');
    const lines = String(text || '').split(/\r?\n/).filter((l) => String(l || '').trim() !== '');
    if (!lines.length) return map;
    const headers = parseCsvLine(lines[0]).map((h) => String(h || '').trim());
    const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
    const idxSerial = headers.indexOf('SERIAL');
    const idxProd = headers.indexOf('PRODUCTO');
    const idxDesc = headers.indexOf('DESCRIPCION');
    if (idxEquipo < 0) return map;

    for (const l of lines.slice(1)) {
      const cols = parseCsvLine(l);
      const equipo = (idxEquipo >= 0 && idxEquipo < cols.length) ? String(cols[idxEquipo] || '').trim() : '';
      if (!equipo) continue;
      const serial = (idxSerial >= 0 && idxSerial < cols.length) ? String(cols[idxSerial] || '').trim() : '';
      const producto = (idxProd >= 0 && idxProd < cols.length) ? String(cols[idxProd] || '').trim() : '';
      const descripcion = (idxDesc >= 0 && idxDesc < cols.length) ? String(cols[idxDesc] || '').trim() : '';
      if (!map.has(equipo)) map.set(equipo, { equipo, serial, producto, descripcion });
    }
  } catch {}
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureAdmin();

  const db = admin.firestore();
  const equipos = buildEquiposTargets();

  // Nota: 'in' permite hasta 10 valores. Aquí son 6.
  // Importante: NO usar orderBy aquí para evitar requerir índice compuesto.
  // Con solo "where in" Firestore usa el índice simple automático.
  const q = db.collection('inspecciones').where('equipo', 'in', equipos);

  const results = [];

  const snap = await q.get();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    results.push({
      id: doc.id,
      equipo: (data.equipo || '').toString(),
      serial: (data.serial || '').toString(),
      producto: (data.producto || '').toString(),
      descripcion: (data.descripcion || '').toString(),
      reporte: (data.reporte || '').toString(),
      tipoInspeccion: (data.tipoInspeccion || data.tipo || '').toString(),
      creadoEn: data.creadoEn && typeof data.creadoEn.toDate === 'function' ? data.creadoEn.toDate().toISOString() : (data.creadoEn || ''),
      fecha: (data.fecha || '').toString(),
      syncStatus: (data.syncStatus || '').toString(),
    });
    if (args.limit > 0 && results.length >= args.limit) break;
  }

  console.log(`Inspecciones encontradas para ${equipos.join(', ')}: ${results.length}`);

  // Export
  if (args.out) {
    if (args.json) {
      fs.writeFileSync(args.out, JSON.stringify({ equipos, count: results.length, results }, null, 2), 'utf8');
      console.log('Escrito JSON:', args.out);
    } else {
      const header = ['id', 'equipo', 'serial', 'producto', 'descripcion', 'reporte', 'tipoInspeccion', 'creadoEn', 'fecha', 'syncStatus'];
      const rows = results.map((r) => header.map((h) => escCsv(r[h] ?? '')).join(','));
      fs.writeFileSync(args.out, [header.join(','), ...rows].join('\n'), 'utf8');
      console.log('Escrito CSV:', args.out);
    }
  }

  const wantsUpdate = !!(args.applyUpdate || args.apply);
  if (wantsUpdate) {
    const invMap = loadInventarioMap(args.invCsv);
    if (!invMap.size) {
      console.log('No se pudo cargar inventario desde:', args.invCsv);
      console.log('Abortando actualización. (Puedes pasar --inv-csv <ruta>)');
      return;
    }

    const changes = [];
    for (const r of results) {
      const inv = invMap.get(String(r.equipo || '').trim());
      if (!inv) continue;
      const patch = {};
      const serialNext = String(inv.serial || '').trim();
      const prodNext = String(inv.producto || '').trim();
      const descNext = String(inv.descripcion || '').trim();
      if (serialNext && String(r.serial || '').trim() !== serialNext) patch.serial = serialNext;
      if (prodNext && String(r.producto || '').trim() !== prodNext) patch.producto = prodNext;
      if (descNext && String(r.descripcion || '').trim() !== descNext) patch.descripcion = descNext;
      if (Object.keys(patch).length) changes.push({ id: r.id, equipo: r.equipo, patch });
    }

    console.log(`Cambios propuestos desde inventario (${args.invCsv}): ${changes.length}`);
    changes.slice(0, 12).forEach((c, i) => {
      console.log(`#${i + 1} ${c.equipo} (${c.id}) patch=${JSON.stringify(c.patch)}`);
    });
    if (!changes.length) return;

    if (!args.applyUpdate) {
      console.log('Dry-run: no se aplicaron cambios. Para aplicar usa: --apply-update');
      return;
    }

    let ok = 0;
    for (const c of changes) {
      try {
        await db.collection('inspecciones').doc(String(c.id)).update({
          ...c.patch,
          inventarioBackfillAt: new Date().toISOString(),
        });
        ok++;
      } catch (e) {
        console.error('No se pudo actualizar', c.id, c.equipo, e?.message || e);
      }
      if (args.sleepMs) await sleep(args.sleepMs);
    }
    console.log(`Actualización completada. OK: ${ok} / ${changes.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
