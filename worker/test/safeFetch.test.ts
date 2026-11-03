import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPrivateAddress } from '../src/net/safeFetch';

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
