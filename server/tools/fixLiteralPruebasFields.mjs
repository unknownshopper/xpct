// Repara resumenes_equipos que tienen campos literales "pruebas.<TIPO>"
// (escritos por el bug de set-merge con llave punteada) y los mueve al
// mapa anidado `pruebas.<TIPO>`, luego borra el literal.
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(here, '../serviceAccount.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const { FieldPath, FieldValue } = admin.firestore;

const snap = await db.collection('resumenes_equipos').get();
let docs = 0, campos = 0;

for (const d of snap.docs) {
  const data = d.data() || {};
  const literales = Object.keys(data).filter(k => /^pruebas\.[^.]+/.test(k));
  if (!literales.length) continue;
  // 1) mover cada literal al nested pruebas.<tipo>
  const patch = {};
  for (const k of literales) {
    const tipo = k.slice('pruebas.'.length);
    patch[new FieldPath('pruebas', tipo)] = data[k];
    campos += 1;
  }
  patch.updatedAt = FieldValue.serverTimestamp();
  await d.ref.update(patch);
  // 2) los literales con punto no se pueden borrar por field path:
  //    reescritura completa del doc sin esas llaves
  const limpio = {};
  for (const [k, v] of Object.entries(data)) if (!/^pruebas\./.test(k)) limpio[k] = v;
  limpio.pruebas = Object.assign({}, limpio.pruebas || {},
    Object.fromEntries(literales.map(k => [k.slice('pruebas.'.length), data[k]])));
  limpio.updatedAt = FieldValue.serverTimestamp();
  await d.ref.set(limpio);
  docs += 1;
}
console.log(`reparados ${docs} resumenes, ${campos} campos literales movidos a pruebas.* anidado`);
process.exit(0);
