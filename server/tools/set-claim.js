const admin = require('firebase-admin');
admin.initializeApp();
const uid = process.argv[2];
if (!uid) { console.error('Falta UID'); process.exit(1); }
admin.auth().setCustomUserClaims(uid, { role: 'admin' })
  .then(()=>{ console.log('OK'); process.exit(0); })
  .catch(e=>{ console.error(e); process.exit(1); });
