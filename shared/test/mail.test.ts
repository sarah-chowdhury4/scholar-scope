import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/platform/secrets/index', () => ({ getSecret: async () => 'xkeysib-test' }));
const { sendMail } = await import('../src/platform/mail/index');

describe('sendMail with Brevo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAIL_BACKEND;
    delete process.env.MAIL_FROM;
  });

  it('sends from the verified sender and returns Brevo\'s message id', async () => {
    process.env.MAIL_BACKEND = 'brevo';
    process.env.MAIL_FROM = 'ScholarScope <team@example.org>';
    const calls: { url: string; body: unknown; key: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), key: (init.headers as Record<string, string>)['api-key']! });
      return new Response(JSON.stringify({ messageId: '<abc@brevo>' }), { status: 201 });
    });
    const result = await sendMail({ to: 'student@example.org', subject: 'Code', text: '123456' });
    expect(result.messageId).toBe('<abc@brevo>');
    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0]!.body).toMatchObject({ sender: { name: 'ScholarScope', email: 'team@example.org' }, to: [{ email: 'student@example.org' }] });
  });

  it("keeps Brevo's reason when a send is refused, without the key", async () => {
    process.env.MAIL_BACKEND = 'brevo';
    vi.stubGlobal('fetch', async () => new Response('{"code":"unauthorized","message":"Sender not verified"}', { status: 400 }));
    const error = await sendMail({ to: 'a@example.org', subject: 's', text: 't' }).catch((e: Error) => e);
    expect(String(error)).toContain('Sender not verified');
    expect(String(error)).not.toContain('xkeysib');
  });
});
