import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('inspecciones').where('equipo', '==', 'PCT-CAP-011').limit(10).get();
snap.forEach(d => {
  const x = d.data();
  console.log(d.id, '| tipo:', x.tipoInspeccion, '| folio:', x.folio || null, '| actividadId:', x.actividadId || null, '| cliente:', JSON.stringify(x.cliente), '| fecha:', x.creadoEn?.toDate?.()?.toISOString?.());
});
process.exit(0);
