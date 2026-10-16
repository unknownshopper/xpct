import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: 'xpct-tab.firebasestorage.app' });
const bucket = admin.storage().bucket();
await bucket.setCorsConfiguration([{
  origin: [
    'http://localhost:2200',
    'https://unknownshopper.github.io',
    'https://www.pc-t.com.mx',
    'https://pc-t.com.mx'
  ],
  method: ['GET', 'HEAD'],
  responseHeader: ['Content-Type', 'Authorization'],
  maxAgeSeconds: 3600
}]);
const [meta] = await bucket.getMetadata();
console.log('CORS ahora:', JSON.stringify(meta.cors, null, 2));
process.exit(0);
