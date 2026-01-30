import admin from 'firebase-admin';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccount.json');

// Inicializa con la clave local en server/serviceAccount.json
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function setRole(email, role) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role });
    console.log(`OK: ${email} -> ${role}`);
  } catch (e) {
    console.error(`Error con ${email}:`, e && e.message ? e.message : e);
  }
}

async function main() {
  // Si pasas argumentos por CLI: node setRole.js email@dominio rol
  const [, , emailArg, roleArg] = process.argv;
  if (emailArg && roleArg) {
    await setRole(emailArg, roleArg);
    console.log('Listo (CLI). Espera 1-2 minutos y haz logout/login.');
    process.exit(0);
  }

  // Valores por defecto para tus capturistas
  await setRole('sgi@pc-t.com.mx', 'supervisor');
  await setRole('auxger@pc-t.com.mx', 'capturista');

  console.log('Listo. Espera propagación 1-2 minutos y haz logout/login.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Fallo general:', e && e.message ? e.message : e);
  process.exit(1);
});
