import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
for (const id of ['insp_c50487e8-d737-418f-9626-f64ce467738a', 'insp_d0842218-a91f-4c6b-9abd-03738747d62e']) {
  const d = await db.collection('inspecciones').doc(id).get();
  const x = d.data();
  console.log('\n', d.id, x.equipo, x.tipoInspeccion, x.folio);
  (x.parametros || []).forEach(p => console.log('  -', p.nombre, '=>', p.estado, p.tipoDano ? `(${p.tipoDano})` : '', p.evidenciaNombre || p.evidenciaPath ? '[foto]' : ''));
}
process.exit(0);
