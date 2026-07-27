import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    outJson: path.resolve(process.cwd(), `equipo_key_audit_${new Date().toISOString().slice(0, 10)}.json`),
    outCsv: path.resolve(process.cwd(), `equipo_key_audit_${new Date().toISOString().slice(0, 10)}.csv`),
    pageSize: 500,
    sleepMs: 150,
    limitDocs: 0,
    includeCollections: 'inventarioEstados,pruebas,inspecciones,actividades',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-json') args.outJson = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--out-csv') args.outCsv = path.resolve(process.cwd(), argv[++i] || '');
    else if (a === '--page-size') args.pageSize = Math.max(50, Math.min(1000, Number(argv[++i] || '500') || 500));
    else if (a === '--sleep-ms') args.sleepMs = Math.max(0, Number(argv[++i] || '150') || 150);
    else if (a === '--limit-docs') args.limitDocs = Number(argv[++i] || '0') || 0;
    else if (a === '--collections') args.includeCollections = String(argv[++i] || args.includeCollections);
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

function sanitizeEquipoKey(raw) {
  let t = String(raw || '');
  t = t.replace(/\u00A0/g, ' ');
  t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');
  t = t.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-');
  t = t.replace(/\s+/g, '');
  t = t.toUpperCase().trim();
  // Evitar dobles guiones por sanitización
  t = t.replace(/-+/g, '-');
  // Quitar guiones al inicio/fin
  t = t.replace(/^-+/, '').replace(/-+$/, '');
  return t;
}

function padLeft(numStr, width) {
  const s = String(numStr || '').replace(/\D/g, '');
  if (!s) return '';
  return s.padStart(width, '0');
}

function canonicalEquipoKey(raw) {
  const s = sanitizeEquipoKey(raw);
  if (!s) return '';
  const parts = s.split('-').filter(Boolean);
  if (!parts.length) return '';

  // Reglas confirmadas por negocio:
  // - PCT-DSA-010: padding 3 en último segmento
  // - PCT-PUP-0521: padding 4 en último segmento
  // - PCT-45-010 / PCT-90-278: padding 3 en último segmento cuando el patrón sea PCT-<num>-<num>
  if (parts.length >= 3 && parts[0] === 'PCT' && parts[1] === 'DSA') {
    const last = padLeft(parts[2], 3);
    if (last) return `PCT-DSA-${last}`;
  }
  if (parts.length >= 3 && parts[0] === 'PCT' && parts[1] === 'PUP') {
    const last = padLeft(parts[2], 4);
    if (last) return `PCT-PUP-${last}`;
  }
  if (parts.length >= 3 && parts[0] === 'PCT' && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
    const mid = String(Number(parts[1]));
    const last = padLeft(parts[2], 3);
    if (last) return `PCT-${mid}-${last}`;
  }

  // Para familias no modeladas aún: solo devolver la versión sanitizada.
  return s;
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function scanCollection({ db, name, pageSize, sleepMs, limitDocs }) {
  let last = null;
  let total = 0;
  const records = [];

  while (true) {
    let q = db.collection(name).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);

    const snap = await q.get();
    if (!snap.size) break;

    for (const doc of snap.docs) {
      total++;
      if (name === 'inventarioEstados') {
        const equipoDocId = doc.id;
        const edo = (doc.data() || {}).edo ?? '';
        records.push({ source: name, docId: doc.id, equipoRaw: equipoDocId, edo });
      } else {
        const data = doc.data() || {};
        const equipoRaw = String(data.equipo || data.equipoId || data.activo || '').trim();
        records.push({ source: name, docId: doc.id, equipoRaw });
      }

      if (limitDocs && total >= limitDocs) break;
    }

    if (limitDocs && total >= limitDocs) break;

    last = snap.docs[snap.docs.length - 1];
    if (sleepMs) await sleep(sleepMs);
  }

  return { total, records };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureAdmin();
  const db = admin.firestore();

  const collections = String(args.includeCollections || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const all = [];
  const totals = {};
  for (const name of collections) {
    const { total, records } = await scanCollection({ db, name, pageSize: args.pageSize, sleepMs: args.sleepMs, limitDocs: args.limitDocs });
    totals[name] = total;
    all.push(...records);
  }

  // Índices
  const canonToRaw = new Map(); // canonical -> Map(raw -> {count, sources:Set})
  const invCanonToDocId = new Map(); // canonical -> Set(docId)
  const issues = [];

  for (const r of all) {
    const raw = String(r.equipoRaw || '').trim();
    if (!raw) continue;
    const sanitized = sanitizeEquipoKey(raw);
    const canon = canonicalEquipoKey(raw);

    if (!canonToRaw.has(canon)) canonToRaw.set(canon, new Map());
    const rawMap = canonToRaw.get(canon);
    if (!rawMap.has(raw)) rawMap.set(raw, { count: 0, sources: new Set(), sanitized, canon });
    const info = rawMap.get(raw);
    info.count++;
    info.sources.add(r.source);

    if (r.source === 'inventarioEstados') {
      if (!invCanonToDocId.has(canon)) invCanonToDocId.set(canon, new Set());
      invCanonToDocId.get(canon).add(r.docId);

      // Señalar docId que no es canónico
      if (canon && raw && canon !== raw) {
        issues.push({
          type: 'INV_DOCID_NOT_CANON',
          equipoRaw: raw,
          equipoSanitized: sanitized,
          equipoCanonical: canon,
          edo: String(r.edo ?? ''),
          source: r.source,
          docId: r.docId,
        });
      }
    }

    // Señalar sanitización que cambia el string (unicode dashes/invisibles)
    if (sanitized && raw !== sanitized) {
      issues.push({
        type: 'RAW_NEEDS_SANITIZE',
        equipoRaw: raw,
        equipoSanitized: sanitized,
        equipoCanonical: canon,
        source: r.source,
        docId: r.docId,
      });
    }

    // Señalar canonicalización que cambia (padding)
    if (canon && sanitized && canon !== sanitized) {
      issues.push({
        type: 'SANITIZED_NEEDS_CANON',
        equipoRaw: raw,
        equipoSanitized: sanitized,
        equipoCanonical: canon,
        source: r.source,
        docId: r.docId,
      });
    }
  }

  // Colisiones: un canonical con múltiples raws distintos
  const collisions = [];
  canonToRaw.forEach((rawMap, canon) => {
    if (!canon) return;
    const raws = Array.from(rawMap.keys());
    if (raws.length <= 1) return;
    collisions.push({
      equipoCanonical: canon,
      rawCount: raws.length,
      raws: raws.map((k) => ({ raw: k, count: rawMap.get(k).count, sources: Array.from(rawMap.get(k).sources) })),
      inventarioDocIds: Array.from(invCanonToDocId.get(canon) || []),
    });
  });

  collisions.sort((a, b) => b.rawCount - a.rawCount || a.equipoCanonical.localeCompare(b.equipoCanonical));

  const summary = {
    generatedAt: new Date().toISOString(),
    totals,
    collections,
    collisionsCount: collisions.length,
    issuesCount: issues.length,
    notes: {
      canonicalRules: [
        'Sanitización universal: guiones unicode→"-", quitar invisibles, trim, mayúsculas, colapsar guiones.',
        'Canonicalización (padding) parcial: PCT-DSA-### (3), PCT-PUP-#### (4), PCT-<num>-### (3).',
        'Familias no modeladas: se reportan pero no se fuerzan; se requiere ampliar reglas conforme catálogo empresarial.',
      ],
    },
  };

  fs.writeFileSync(args.outJson, JSON.stringify({ summary, collisions, issues }, null, 2), 'utf8');

  const headers = [
    'type',
    'equipoRaw',
    'equipoSanitized',
    'equipoCanonical',
    'source',
    'docId',
    'edo',
  ];
  const lines = [headers.join(',')];
  for (const it of issues) {
    lines.push(
      headers
        .map((h) => csvEscape(it[h] ?? ''))
        .join(',')
    );
  }
  fs.writeFileSync(args.outCsv, lines.join('\n'), 'utf8');

  process.stdout.write(
    `Colecciones: ${collections.join(', ')}\n` +
      `Leídos: ${collections.map((c) => `${c}=${totals[c] ?? 0}`).join(' | ')}\n` +
      `Colisiones (canonical con >1 raw): ${collisions.length}\n` +
      `Issues: ${issues.length}\n` +
      `CSV: ${args.outCsv}\nJSON: ${args.outJson}\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
