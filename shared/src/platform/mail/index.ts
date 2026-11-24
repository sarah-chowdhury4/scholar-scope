import nodemailer, { type Transporter } from 'nodemailer';
import { getSecret } from '../secrets/index';

/**
 * Every email ScholarScope sends. Only the WORKER calls this: the API queues emails (see outbox.ts).
 *   MAIL_BACKEND=smtp  -> Mailpit locally (http://localhost:8025 shows every message). The default.
 *   MAIL_BACKEND=gmail -> a Gmail account with an app password (about 500 emails a day, nothing to sign up for).
 *                         SMTP_USER = the Gmail address, SMTP_PASSWORD (in .env.secrets) = its app password.
 *   MAIL_BACKEND=brevo -> Brevo transactional email API (free plan about 300 a day).
 *                         MAIL_FROM must be a sender address verified in Brevo.
 */
export type Mail = { to: string; subject: string; text: string };

const DEFAULT_FROM = 'ScholarScope <alerts@scholarscope.local>';
const from = () => process.env.MAIL_FROM?.trim() || DEFAULT_FROM;

let transports: Map<string, Promise<Transporter>> | undefined;

function transport(kind: 'smtp' | 'gmail'): Promise<Transporter> {
  transports ??= new Map();
  let t = transports.get(kind);
  if (!t) {
    t = (async () => {
      if (kind === 'gmail') {
        const user = process.env.SMTP_USER?.trim();
        if (!user) throw new Error('MAIL_BACKEND=gmail but SMTP_USER (the Gmail address) is not set in .env');
        // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces are not part of it.
        const pass = (await getSecret('smtp-password')).replace(/\s+/g, '');
        if (!pass) throw new Error('MAIL_BACKEND=gmail but SMTP_PASSWORD (the Gmail app password) is not set in .env.secrets');
        return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
      }
      return nodemailer.createTransport({ host: process.env.SMTP_HOST || 'mailpit', port: Number(process.env.SMTP_PORT || 1025), secure: false });
    })();
    // A failed setup (missing setting) must not be cached: the next email tries again after the fix.
    t.catch(() => transports?.delete(kind));
    transports.set(kind, t);
  }
  return t;
}

/**
 * Gmail sends only as the signed-in account: keep MAIL_FROM's display name, but always use the Gmail address,
 * so the message is not rewritten or marked as spoofed.
 */
export function gmailFrom(mailFrom: string, gmailAddress: string): string {
  const [name] = parseFrom(mailFrom || DEFAULT_FROM);
  return `${name} <${gmailAddress}>`;
}

/** Turn Gmail's SMTP refusals into something a developer can act on. */
export function explainGmailError(err: unknown): Error {
  const text = err instanceof Error ? err.message : String(err);
  if (/535|Username and Password not accepted|Invalid login|EAUTH/i.test(text)) {
    return new Error(
      'Gmail refused the login. Check SMTP_USER is the full Gmail address and SMTP_PASSWORD is an app password ' +
        '(Google Account > Security > App passwords; 2-Step Verification must be on), not the normal password.',
    );
  }
  if (/550|5\.4\.5|Daily user sending limit|quota/i.test(text)) {
    return new Error('Gmail stopped sending for now: the daily sending limit was reached. It resets within about a day.');
  }
  return new Error(`Gmail send failed: ${text.slice(0, 300)}`);
}

export async function sendMail(mail: Mail): Promise<{ messageId: string }> {
  const backend = process.env.MAIL_BACKEND || 'smtp';

  if (backend === 'brevo') {
    const key = await getSecret('brevo-api-key');
    if (!key) throw new Error('MAIL_BACKEND=brevo but BREVO_API_KEY is not set in .env.secrets');
    const [name, address] = parseFrom(from());
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name, email: address }, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }),
    });
    if (!res.ok) {
      // Brevo explains itself (unverified sender, daily limit reached...); keep that, never the key.
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo send failed with HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as { messageId?: string };
    return { messageId: body.messageId ?? '' };
  }

  if (backend === 'gmail') {
    const t = await transport('gmail');
    try {
      const info = await t.sendMail({ from: gmailFrom(from(), process.env.SMTP_USER!.trim()), to: mail.to, subject: mail.subject, text: mail.text });
      return { messageId: info.messageId };
    } catch (err) {
      throw explainGmailError(err);
    }
  }

  const info = await (await transport('smtp')).sendMail({ from: from(), to: mail.to, subject: mail.subject, text: mail.text });
  return { messageId: info.messageId };
}

function parseFrom(value: string): [string, string] {
  const m = /^(.*)<(.+)>$/.exec(value.trim());
  return m ? [m[1]!.trim() || 'ScholarScope', m[2]!.trim()] : ['ScholarScope', value.trim()];
}
