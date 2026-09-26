import admin from 'firebase-admin';
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../serviceAccount.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Buscar variantes CA-13 / CA-013 en varias colecciones
const norm = s => String(s||'').toUpperCase().replace(/\s+/g,'').replace(/^PCT-?/,'');
const match = s => /^CA-?0*13$/.test(norm(s));

for (const col of ['equipos','inventario','resumenes_equipos','inspecciones','actividades','pruebas']) {
  try {
    const snap = await db.collection(col).get();
    const hits = [];
    snap.forEach(d => {
      const x = d.data() || {};
      const candidatos = [d.id, x.equipo, x.equipoId, x.activo, x.equipoCanon].filter(Boolean);
      if (candidatos.some(match)) hits.push({ id: d.id, equipo: x.equipo, activo: x.activo, canon: x.equipoCanon });
    });
    console.log(`\n== ${col}: ${hits.length} coincidencias ==`);
    hits.slice(0,15).forEach(h => console.log(' ', JSON.stringify(h)));
    if (hits.length>15) console.log(`  ... +${hits.length-15} más`);
  } catch (e) { console.log(`== ${col}: ${e.message}`); }
}
process.exit(0);
