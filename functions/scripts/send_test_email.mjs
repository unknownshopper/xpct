import nodemailer from 'nodemailer';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to') out.to = argv[++i];
    else if (a === '--subject') out.subject = argv[++i];
    else if (a === '--text') out.text = argv[++i];
    else if (a === '--html') out.html = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(String(process.env.SMTP_PORT || '587').trim(), 10);
  const user = (process.env.SMTP_USER || '').trim();
  let pass = String(process.env.SMTP_PASS || '');

  if (!host) throw new Error('Missing SMTP_HOST');
  if (!port || Number.isNaN(port)) throw new Error('Invalid SMTP_PORT');
  if (!user) throw new Error('Missing SMTP_USER');
  if (!args.to) throw new Error('Missing --to <email>');

  if (!pass) {
    const rl = readline.createInterface({ input, output });
    pass = await rl.question('SMTP_PASS (no se mostrará): ');
    rl.close();
    if (!pass) throw new Error('SMTP_PASS vacío');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const subject = args.subject || `Prueba SMTP – ${new Date().toISOString()}`;
  const text = args.text || 'Correo de prueba SMTP (XPCT).';
  const html = args.html || `<div style="font-family:Arial;">${text}</div>`;

  const info = await transporter.sendMail({
    from: { name: 'PCT Notificaciones', address: user },
    to: args.to,
    subject,
    text,
    html,
  });

  console.log('OK. MessageId:', info.messageId);
  if (info.response) console.log('SMTP response:', info.response);
}

main().catch(err => {
  console.error('ERROR:', err?.message || err);
  process.exit(1);
});
