import admin from 'firebase-admin';
import fs from 'fs';

const creds = JSON.parse(fs.readFileSync('serviceAccount.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();

const desired = [];
for (let i = 0; i <= 11; i++) {
  const newK = `PCT-90-${String(290 + i).padStart(3, '0')}`;
  const expectedSerial = `25111-${String(58 + i).padStart(3, '0')}`;
  desired.push({ newK, expectedSerial });
}

const ts = Date.now();
const tmpKey = (k) => `TMP-${k}-${ts}`;

// 1) Encontrar en Firestore los docs que correspondan a los seriales físicos 25111-058..069.
// Nota: en esta base, el campo `serial` puede contener otro identificador (p.ej. PCT-24-6206-90-001),
// por lo que buscamos el serial físico dentro de `infoFlejeCompleta` / `infoFleje` / `descripcion`.
const serialToTarget = new Map(desired.map(d => [d.expectedSerial, d.newK]));
const serials = desired.map(d => d.expectedSerial);

const wanted = new Set(serials);
const found = new Map();

const extractSerial = (data) => {
  const candidates = [
    String((data && data.serial) || ''),
    String((data && data.infoFlejeCompleta) || ''),
    String((data && data.infoFleje) || ''),
    String((data && data.descripcion) || ''),
  ].join(' ');
  const m = candidates.match(/\b25111-\d{3}\b/);
  return m ? String(m[0]).trim() : '';
};

const snapAll = await db.collection('equipos').get();
snapAll.forEach(doc => {
  const data = doc.data() || {};
  const s = extractSerial(data);
  if (!s || !wanted.has(s)) return;
  // Si hubiera duplicados (no debería), quedarse con el primero para no hacer cambios ambiguos.
  if (!found.has(s)) found.set(s, { docId: doc.id, data });
});

const precheck = [];
let ok = true;
for (const s of serials) {
  const target = serialToTarget.get(s);
  const hit = found.get(s);
  const currentId = hit ? String(hit.docId || '').trim() : '';
  const exists = !!hit;
  if (!exists) ok = false;
  precheck.push({ serial: s, found: exists, currentDocId: currentId, targetDocId: target });
}

if (!ok) {
  console.log(JSON.stringify({ ok: false, stage: 'precheck_failed', precheck }, null, 2));
  process.exit(2);
}

// Mapping final: docId actual -> docId deseado
const mapping = [];
for (const s of serials) {
  const hit = found.get(s);
  mapping.push({ oldK: hit.docId, newK: serialToTarget.get(s), expectedSerial: s, data: hit.data });
}

// 2) Move colliding target keys out of the way (copy -> TMP, mark redirect)
const movedNewToTmp = [];
for (const m of mapping) {
  if (m.oldK === m.newK) continue;
  const dstSnap = await db.collection('equipos').doc(m.newK).get();
  if (!dstSnap.exists) continue;
  const dstData = dstSnap.data() || {};
  const dstSerial = String(dstData.serial || '').trim();
  if (dstSerial && dstSerial !== m.expectedSerial) {
    const tmp = tmpKey(m.newK);
    await db.collection('equipos').doc(tmp).set(
      { ...dstData, equipoKey: tmp, movedFrom: m.newK, movedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    await db.collection('equipos').doc(m.newK).set(
      { deprecated: true, redirectTo: tmp, movedToTmp: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    movedNewToTmp.push({ from: m.newK, to: tmp, serial: dstSerial });
  }
}

// 3) Copy OLD -> NEW (set equipoKey to new, deprecate old)
const migratedEquipos = [];
for (const m of mapping) {
  const oldData = m.data || {};
  const oldSerial = String(oldData.serial || '').trim();
  if (m.oldK === m.newK) {
    migratedEquipos.push({ from: m.oldK, to: m.newK, serial: oldSerial, skipped: 'already_correct' });
    continue;
  }
  await db.collection('equipos').doc(m.newK).set(
    { ...oldData, equipoKey: m.newK, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  await db.collection('equipos').doc(m.oldK).set(
    { deprecated: true, redirectTo: m.newK, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  migratedEquipos.push({ from: m.oldK, to: m.newK, serial: oldSerial });
}

// 4) Move resumenes_equipos docIds (copy new, mark old)
const migratedResumenes = [];
for (const m of mapping) {
  if (m.oldK === m.newK) continue;
  const src = await db.collection('resumenes_equipos').doc(m.oldK).get();
  if (!src.exists) continue;

  const data = src.data() || {};
  await db.collection('resumenes_equipos').doc(m.newK).set(
    { ...data, equipoKey: m.newK, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  await db.collection('resumenes_equipos').doc(m.oldK).set(
    { deprecated: true, redirectTo: m.newK, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  migratedResumenes.push({ from: m.oldK, to: m.newK });
}

// 5) Update references in pruebas + inspecciones (scan and batch)
const mapOldToNew = new Map(mapping.map(m => [m.oldK, m.newK]));

async function updateRefs(col) {
  const snap = await db.collection(col).get();
  const batchLimit = 400;
  let batch = db.batch();
  let ops = 0;
  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const patch = {};

    for (const field of ['equipoKey', 'equipo', 'equipoId']) {
      const v = String(data[field] || '').trim();
      const nv = mapOldToNew.get(v);
      if (nv) patch[field] = nv;
    }

    if (!Object.keys(patch).length) continue;

    batch.update(db.collection(col).doc(doc.id), patch);
    ops += 1;
    updated += 1;

    if (ops >= batchLimit) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return updated;
}

const updatedPruebas = await updateRefs('pruebas');
const updatedInspecciones = await updateRefs('inspecciones');

console.log(JSON.stringify({
  ok: true,
  stage: 'done',
  tmpSuffix: ts,
  precheck,
  movedNewToTmp,
  migratedEquipos,
  migratedResumenes,
  updatedRefs: { pruebas: updatedPruebas, inspecciones: updatedInspecciones },
}, null, 2));
