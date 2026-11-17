import nodemailer from 'nodemailer';
import { getSecret } from '../secrets/index';

/**
 * Every email ScholarScope sends. Only the WORKER calls this: the API queues emails (see outbox.ts).
 *   MAIL_BACKEND=smtp  -> Mailpit locally (http://localhost:8025 shows every message)
 *   MAIL_BACKEND=brevo -> Brevo transactional email API (real inboxes; free plan about 300 emails a day).
 *                         MAIL_FROM must be a sender address verified in Brevo.
 */
export type Mail = { to: string; subject: string; text: string };

const from = () => process.env.MAIL_FROM || 'ScholarScope <alerts@scholarscope.local>';

export async function sendMail(mail: Mail): Promise<{ messageId: string }> {
  if (process.env.MAIL_BACKEND === 'brevo') {
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

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mailpit',
    port: Number(process.env.SMTP_PORT || 1025),
    secure: false,
  });
  const info = await transport.sendMail({ from: from(), to: mail.to, subject: mail.subject, text: mail.text });
  return { messageId: info.messageId };
}

function parseFrom(value: string): [string, string] {
  const m = /^(.*)<(.+)>$/.exec(value.trim());
  return m ? [m[1]!.trim(), m[2]!.trim()] : ['ScholarScope', value.trim()];
}
