#!/usr/bin/env node
import 'dotenv/config';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function ensureAdmin() {
  if (admin.apps.length) return;
  // Prefer explicit file path if provided
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let creds = null;
  try {
    if (filePath && fs.existsSync(path.resolve(filePath))) {
      const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
      creds = JSON.parse(raw);
    } else if (jsonEnv) {
      // Some shells wrap JSON in single quotes; trim surrounding quotes if present
      let raw = jsonEnv.trim();
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        raw = raw.slice(1, -1);
      }
      creds = JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_*:', e && e.message ? e.message : e);
  }

  if (creds && typeof creds === 'object') {
    if (creds.private_key && typeof creds.private_key === 'string') {
      // Normalize newlines and unescape sequences
      let pk = creds.private_key;
      pk = pk.replace(/\r\n/g, '\n');
      pk = pk.replace(/\\r\\n/g, '\n');
      pk = pk.replace(/\\n/g, '\n');
      // Remove accidental surrounding quotes
      pk = pk.trim();
      if ((pk.startsWith('"') && pk.endsWith('"')) || (pk.startsWith("'") && pk.endsWith("'"))) {
        pk = pk.slice(1, -1);
      }
      // Ensure BEGIN/END markers are on their own lines
      pk = pk.replace(/-----BEGIN PRIVATE KEY-----\s*/m, '-----BEGIN PRIVATE KEY-----\n');
      pk = pk.replace(/\s*-----END PRIVATE KEY-----/m, '\n-----END PRIVATE KEY-----\n');
      creds.private_key = pk;
    }
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  } else {
    // Fallback to ADC (GOOGLE_APPLICATION_CREDENTIALS or environment on machine)
    admin.initializeApp();
  }
}

function usage() {
  console.log('Usage: node tools/setRole.mjs <email> <role>');
  console.log('Roles: admin | director | inspector | capturista | none');
}

async function main() {
  const [, , emailArg, roleArg] = process.argv;
  if (!emailArg || !roleArg) {
    usage();
    process.exit(1);
  }
  const email = String(emailArg).trim().toLowerCase();
  const role = String(roleArg).trim().toLowerCase();
  const allowed = new Set(['admin', 'director', 'inspector', 'capturista', 'none']);
  if (!allowed.has(role)) {
    console.error('Invalid role. Allowed:', Array.from(allowed).join(', '));
    process.exit(1);
  }

  ensureAdmin();
  const auth = admin.auth();

  try {
    const user = await auth.getUserByEmail(email);
    const claims = user.customClaims || {};

    if (role === 'none') {
      delete claims.role;
    } else {
      claims.role = role;
    }

    await auth.setCustomUserClaims(user.uid, claims);

    // Revoke refresh tokens so new claim propagates quickly
    await auth.revokeRefreshTokens(user.uid);

    console.log(`OK: role for ${email} set to ${role}`);
    console.log('Note: user must sign out/in (or refresh ID token) to receive new claims.');
  } catch (e) {
    console.error('Failed to set role:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

main();
