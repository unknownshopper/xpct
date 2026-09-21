import admin from 'firebase-admin';
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../serviceAccount.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TIPO_MAP = { 'PRE-TRABAJO':'PRE','PRETRABAJO':'PRE','POST-TRABAJO':'P0S','POSTTRABAJO':'P0S','RECEPCION':'REC','REINSPECCION':'REI','REPARACION':'REP' };
const snap = await db.collection('inspecciones').get();
const sin = [];
snap.forEach(d => {
  const x = d.data() || {};
  if (x.folio) return;
  const tipo = TIPO_MAP[String(x.tipoInspeccion||'').toUpperCase().trim()];
  if (!tipo) { console.log('SKIP tipo invalido:', d.id, x.tipoInspeccion); return; }
  const ms = x.creadoEn && x.creadoEn.toDate ? x.creadoEn.toDate().getTime() : (x.fecha && x.fecha.toDate ? x.fecha.toDate().getTime() : 0);
  sin.push({ id: d.id, tipo, ms, equipo: x.equipo });
});
sin.sort((a,b) => a.ms - b.ms);
console.log('sin folio:', sin.length);

for (const it of sin) {
  const yy = '26'; // todos son 2026 (verificado: mes 2026-09)
  const counterId = `PCT-${it.tipo}-${yy}`;
  await db.runTransaction(async (t) => {
    const inspRef = db.collection('inspecciones').doc(it.id);
    const inspSnap = await t.get(inspRef);
    const data = inspSnap.data() || {};
    if (data.folio) return;
    const counterRef = db.collection('folioCounters').doc(counterId);
    const cSnap = await t.get(counterRef);
    const next = (cSnap.exists ? ((cSnap.data()||{}).next || 1) : 1);
    const folio = `PCT-${it.tipo}-${yy}-${String(next).padStart(4,'0')}`;
    const lockRef = db.collection('folios').doc(folio);
    const lockSnap = await t.get(lockRef);
    if (lockSnap.exists) throw new Error('COLLISION:' + folio);
    t.set(counterRef, { next: next + 1, tipo: it.tipo, yy, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    t.set(lockRef, { inspeccionId: it.id, folio, tipo: it.tipo, yy, seq: next, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    t.update(inspRef, { folio, folioKey: folio.toUpperCase(), folioTipo: it.tipo, folioYY: yy, folioSeq: next, folioAsignadoEn: admin.firestore.FieldValue.serverTimestamp() });
    console.log('OK', it.equipo, it.id, '->', folio);
  });
}
console.log('done');
process.exit(0);
