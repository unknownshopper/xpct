import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: 'xpct-tab.firebasestorage.app' });
const db = admin.firestore();

const q = await db.collection('inspecciones').where('folio','==','PCT-PRE-26-1249').get();
for (const d of q.docs) {
  const x = d.data();
  const p = (x.parametros || [])[0];
  console.log('evidenciaUrl:\n', String(p.evidenciaUrl||'').slice(0,400));
  console.log('\nobsUrl:\n', String(x.observacionesFotoUrl||'').slice(0,400));
}
process.exit(0);
