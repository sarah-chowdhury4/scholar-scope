/**
 * Check the email setup and, optionally, send one test email. Never prints keys or passwords.
 *
 *   docker compose exec worker npm run mail:test                      # check the settings only
 *   docker compose exec worker npm run mail:test -- you@example.com   # and send a test email there
 *
 * With MAIL_BACKEND=brevo it asks Brevo whether the key works and whether MAIL_FROM is one of your
 * verified senders: Brevo refuses to send from any other address.
 */
import { getSecret, sendMail } from '@scholarscope/shared';

const backend = process.env.MAIL_BACKEND || 'smtp';
const from = process.env.MAIL_FROM?.trim() || '';
const fromAddress = (/<(.+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
const args = process.argv.slice(2).filter((a) => a !== '--');
// Exactly one plain address: a command pasted twice ("...@gmail.comdocker compose exec ...") must not send anywhere.
if (args.length > 1 || (args[0] && !/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i.test(args[0]))) {
  console.error(`Give one email address, e.g.: npm run mail:test -- you@example.com\nGot: ${args.join(' ')}`);
  process.exit(1);
}
const to = args[0];
let ok = true;
const fail = (message: string) => {
  ok = false;
  console.log(`  ✗ ${message}`);
};

console.log(`Mail backend: ${backend}`);

if (backend === 'smtp') {
  console.log('  Emails go to the Mailpit test inbox at http://localhost:8025, not to real inboxes.');
  console.log('  For real emails set MAIL_BACKEND=brevo (or gmail) in .env; see README "Send real emails".');
}

if (backend === 'brevo') {
  const key = await getSecret('brevo-api-key').catch(() => '');
  if (!key) {
    fail('BREVO_API_KEY is empty. Put it in .env.secrets, then run: docker compose restart localstack worker');
  } else {
    const headers = { 'api-key': key, accept: 'application/json' };
    const account = await fetch('https://api.brevo.com/v3/account', { headers });
    if (account.status === 401) {
      fail('Brevo does not accept this API key. Copy it again from Brevo > SMTP & API > API keys (an "xkeysib-..." key, not the SMTP password).');
    } else if (!account.ok) {
      fail(`Brevo account check failed (HTTP ${account.status}): ${(await account.text()).slice(0, 200)}`);
    } else {
      console.log('  ✓ Brevo accepts the API key.');
      const res = await fetch('https://api.brevo.com/v3/senders', { headers });
      const senders = res.ok ? (((await res.json()) as { senders?: { email: string; active: boolean }[] }).senders ?? []) : [];
      const verified = senders.filter((s) => s.active).map((s) => s.email.toLowerCase());
      if (!fromAddress) {
        fail(`MAIL_FROM is empty in .env. Set it to a verified sender, e.g. MAIL_FROM=ScholarScope <${verified[0] ?? 'your-verified-address'}>`);
      } else if (!verified.includes(fromAddress)) {
        fail(`MAIL_FROM (${fromAddress}) is not a verified Brevo sender, so Brevo will refuse to send from it.`);
      } else {
        console.log(`  ✓ MAIL_FROM (${fromAddress}) is a verified Brevo sender.`);
      }
      if (verified.length) console.log(`  Verified senders on this account: ${verified.join(', ')}`);
      else console.log('  This Brevo account has no verified sender yet: Brevo > Senders, domains & dedicated IPs > Senders > Add a sender.');
    }
  }
}

if (backend === 'gmail') {
  if (!process.env.SMTP_USER) fail('SMTP_USER (the Gmail address) is empty in .env.');
  if (!(await getSecret('smtp-password').catch(() => ''))) fail('SMTP_PASSWORD (the Gmail app password) is empty in .env.secrets.');
  if (ok) console.log('  ✓ Gmail address and app password are set (Gmail checks them when sending).');
}

if (to) {
  if (!ok) {
    console.log(`\nNot sending to ${to}: fix the items above first.`);
  } else {
    try {
      const { messageId } = await sendMail({
        to,
        subject: 'ScholarScope test email',
        text: 'This is a test email from your ScholarScope setup. If you can read it, emails work.',
      });
      console.log(`\n✓ Sent a test email to ${to} (message id ${messageId}). Check the inbox and the spam folder.`);
    } catch (err) {
      ok = false;
      console.log(`\n✗ Sending failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

console.log(ok ? '\nEmail setup looks good.' : '\nEmail is not working yet: see the ✗ lines above.');
process.exit(ok ? 0 : 1);
