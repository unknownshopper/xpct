import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: 'xpct-tab.firebasestorage.app' });
const bucket = admin.storage().bucket();
const [meta] = await bucket.getMetadata();
console.log(JSON.stringify(meta.cors || 'SIN CONFIG CORS', null, 2));
process.exit(0);
