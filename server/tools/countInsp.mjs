import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../serviceAccount.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('inspecciones').get();
let total = 0, conFolio = 0, conCreadoEn = 0, sinCreadoEn = 0;
const byTipo = {}; const sinCreadoByTipo = {}; const fields = {};
snap.forEach(d => {
  total++;
  const x = d.data() || {};
  if (x.folio) conFolio++;
  const ce = x.creadoEn;
  const hasCe = ce !== undefined && ce !== null && ce !== '';
  if (hasCe) conCreadoEn++; else { sinCreadoEn++; const t = String(x.tipoInspeccion||'').toUpperCase()||'(vacio)'; sinCreadoByTipo[t]=(sinCreadoByTipo[t]||0)+1; }
  const t = String(x.tipoInspeccion||'').toUpperCase()||'(vacio)';
  byTipo[t] = (byTipo[t]||0)+1;
  Object.keys(x).forEach(k => { fields[k]=(fields[k]||0)+1; });
});
console.log({ total, conFolio, conCreadoEn, sinCreadoEn });
console.log('byTipo:', byTipo);
console.log('sinCreadoEn byTipo:', sinCreadoByTipo);
console.log('campos frecuentes:', Object.entries(fields).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>`${k}:${v}`).join(', '));
process.exit(0);
