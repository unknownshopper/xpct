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
        // Solo iniciar comillas si el campo aún está vacío (" al inicio del campo)
        if (cur === '') {
          inQ = true;
        } else {
          // Comillas no escapadas dentro del texto (ej: 4") => tratarlas como literal
          cur += '"';
        }
      } else {
        // Dentro de comillas: permitir escape con ""
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

function parseDdMmAa(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const aa = parseInt(m[3], 10);
  const yyyy = (m[3].length <= 2) ? (2000 + aa) : aa;
  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function norm(v) {
  return String(v || '').replace(/\u00A0/g, ' ').trim();
}

async function main() {
  const args = parseArgs(process.argv);

  const csvPath = args.csv || path.resolve(process.cwd(), '../../docs/ixachi86.csv');
  const clienteOverride = args.cliente || '';
  const areaOverride = args.area || '';
  const ubicOverride = args.ubicacion || '';
  const ocOverride = args.oc || '';
  const dryRun = args.dry === '1' || args.dry === 'true';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const saPath = path.resolve(__dirname, '../serviceAccount.json');
  const saRaw = await fs.readFile(saPath, 'utf8');
  const serviceAccount = JSON.parse(saRaw);

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const txt = await fs.readFile(csvPath, 'utf8');
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('CSV vacío');

  const header = csvParseLine(lines[0]).map(h => h.toLowerCase());
  const idx = (name) => header.indexOf(String(name).toLowerCase());

  const iCliente = idx('cliente');
  const iArea = idx('area');
  const iUbic = idx('ubicacion');
  const iInicio = idx('inicio');
  const iTerm = idx('terminacion');
  const iDesc = idx('descripcion');
  const iNoSerie = idx('no_serie');
  const iAviso = idx('aviso_embarque');
  const iEst = idx('estimacion');
  const iPrecio = idx('precio');

  const required = [iCliente, iArea, iUbic, iInicio, iDesc, iNoSerie];
  if (required.some(x => x < 0)) {
    throw new Error(`CSV no contiene columnas requeridas. Header=${header.join(',')}`);
  }

  const db = admin.firestore();
  const col = db.collection('actividades');

  const created = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = csvParseLine(lines[li]);
    const cliente = norm(clienteOverride || cols[iCliente]);
    const areaCliente = norm(areaOverride || cols[iArea]);
    const ubicacion = norm(ubicOverride || cols[iUbic]);
    const inicio = norm(cols[iInicio]);
    const terminacion = (iTerm >= 0) ? norm(cols[iTerm]) : '';
    const descripcion = norm(cols[iDesc]);
    const equipo = norm(cols[iNoSerie]);
    const serial = equipo;

    const dIni = parseDdMmAa(inicio);
    if (!dIni) throw new Error(`Inicio inválido en línea ${li + 1}: ${inicio}`);
    const inicioTs = dIni.getTime();

    let termVal = '';
    if (terminacion) {
      const dTerm = parseDdMmAa(terminacion);
      if (!dTerm) throw new Error(`Terminación inválida en línea ${li + 1}: ${terminacion}`);
      termVal = terminacion;
    }

    const aviso = (iAviso >= 0) ? norm(cols[iAviso]) : '';
    const estimacion = (iEst >= 0) ? norm(cols[iEst]) : '';
    const precioRaw = (iPrecio >= 0) ? norm(cols[iPrecio]) : '';
    const precio = precioRaw ? Number(precioRaw) : null;

    const oc = norm(ocOverride || (estimacion ? `OC-${estimacion}` : ''));

    const payload = {
      cliente,
      tipo: '',
      terceroPropiedad: '',
      areaCliente,
      ubicacion,
      descripcion,
      equipo,
      serial,
      equipos: [equipo],
      oc,
      ordenSuministro: '',
      os: '',
      fechaEmbarque: '',
      embarqueTs: null,
      inicioServicio: inicio,
      terminacionServicio: termVal,
      terminacionEsFinal: false,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
      inicioTs,
      anioInicio: dIni.getFullYear(),
      avisoEmbarque: aviso,
      estimacion,
      precio: (precio != null && !Number.isNaN(precio)) ? precio : '',
    };

    if (dryRun) {
      created.push({ equipo, cliente, ubicacion, inicio, terminacion: termVal, oc });
      continue;
    }

    const ref = await col.add(payload);
    created.push({ id: ref.id, equipo, cliente, ubicacion, inicio, terminacion: termVal, oc });
  }

  const out = {
    ok: true,
    dryRun,
    csvPath,
    count: created.length,
    created,
  };

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
