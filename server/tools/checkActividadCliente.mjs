import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const ids = ['insp_c50487e8-d737-418f-9626-f64ce467738a'];
const snap2 = await db.collection('inspecciones').where('equipo', '==', 'PCT-CAP-011').limit(5).get();
snap2.forEach(d => { const x = d.data(); if (!x.folio) ids.push(d.id); });
for (const id of ids) {
  const d = await db.collection('inspecciones').doc(id).get();
  const x = d.data();
  console.log('INSP', d.id, '| tipo:', x.tipoInspeccion, '| actividadId:', x.actividadId || null, '| equipo:', x.equipo, '| cliente:', JSON.stringify(x.cliente), '| area:', JSON.stringify(x.areaCliente));
  if (x.actividadId) {
    const a = await db.collection('actividades').doc(String(x.actividadId)).get();
    if (a.exists) {
      const ad = a.data();
      console.log('   ACT', a.id, '| cliente:', JSON.stringify(ad.cliente), '| area:', JSON.stringify(ad.areaCliente), '| tipo:', ad.tipoInspeccion || ad.tipo, '| estado:', ad.estado);
    } else console.log('   ACT', x.actividadId, 'NO EXISTE');
  }
}
process.exit(0);
