import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url)));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const TARGETS = ['PCT-CAP-026', 'PCT-CAP-027', 'PCT-PLG-026', 'PCT-PLG-027'];
const NUEVA = '7500';

const fixStr = (v) => (typeof v === 'string' && v.includes('10000')) ? v.replaceAll('10000', NUEVA) : v;

for (const eq of TARGETS) {
  const snap = await db.collection('equipos').where('equipoKey', '==', eq).get();
  if (snap.empty) { console.log('NO encontrado:', eq); continue; }
  for (const d of snap.docs) {
    const r = d.data();
    const upd = {};
    for (const f of ['pt', 'presion1', 'presion2', 'presion3', 'descripcion', 'infoFleje', 'infoFlejeCompleta']) {
      const nv = fixStr(r[f]);
      if (nv !== r[f]) upd[f] = nv;
    }
    if (!Object.keys(upd).length) { console.log(eq, 'sin cambios'); continue; }
    console.log(eq, '=>', JSON.stringify(upd));
    if (APPLY) {
      upd.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await d.ref.update(upd);
      console.log('  APLICADO');
    }
  }
}
console.log(APPLY ? 'MODO APPLY' : 'DRY RUN — usar --apply para escribir');
process.exit(0);
