import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('inspecciones')
  .where('equipo', '==', 'PCT-XO-096').limit(20).get();
const rows = [];
snap.forEach(d => {
  const x = d.data();
  rows.push({
    id: d.id,
    folio: x.folio || null,
    tipo: x.tipoInspeccion,
    fecha: x.fecha?.toDate?.()?.toISOString?.() || String(x.fecha || ''),
    creadoEn: x.creadoEn?.toDate?.()?.toISOString?.() || String(x.creadoEn || ''),
    cliente: x.cliente ?? null,
    areaCliente: x.areaCliente ?? null,
    ubicacion: x.ubicacion ?? null,
    ubicacionGps: x.ubicacionGps ?? null,
    usuario: x.usuarioInspeccion || x.usuarioInspeccionEmail,
  });
});
rows.sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));
console.log(JSON.stringify(rows, null, 1));
process.exit(0);
