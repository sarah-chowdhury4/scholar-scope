import { afterEach, describe, expect, it } from 'vitest';
import { assertPublicUrl, isAllowedLocalTestHost, isPrivateAddress } from '../src/net/safeFetch';

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.10', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1'])(
    'blocks %s',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '142.250.72.14', '2606:4700::1111'])('allows %s', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('assertPublicUrl', () => {
  it('rejects non-http schemes and internal addresses', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicUrl('http://169.254.169.254/computeMetadata/v1/')).rejects.toThrow();
    await expect(assertPublicUrl('http://127.0.0.1:9000/originals')).rejects.toThrow();
    await expect(assertPublicUrl('https://user:pass@example.com')).rejects.toThrow();
  });
});

describe('local test hosts', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('lets a listed host through only in local development', async () => {
    process.env.FETCH_ALLOW_PRIVATE_HOSTS = 'sample-scholarship.localhost';
    process.env.APP_ENV = 'local';
    expect(isAllowedLocalTestHost('http://sample-scholarship.localhost:8088/')).toBe(true);
    await expect(assertPublicUrl('http://sample-scholarship.localhost:8088/')).resolves.toBeInstanceOf(URL);
    expect(isAllowedLocalTestHost('http://minio:9000/')).toBe(false);
    expect(isAllowedLocalTestHost('http://evil.sample-scholarship.localhost/')).toBe(false);

    process.env.APP_ENV = 'production';
    expect(isAllowedLocalTestHost('http://sample-scholarship.localhost:8088/')).toBe(false);
  });

  it('allows nothing when the list is empty', () => {
    process.env.APP_ENV = 'local';
    delete process.env.FETCH_ALLOW_PRIVATE_HOSTS;
    expect(isAllowedLocalTestHost('http://localhost/')).toBe(false);
  });
});
