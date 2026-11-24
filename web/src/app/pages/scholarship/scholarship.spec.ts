import { friendlyFetchError } from './scholarship';

describe('friendlyFetchError', () => {
  it('explains robots.txt blocks and unreachable pages', () => {
    expect(friendlyFetchError('Processing failed: robots_blocked')).toContain('upload the file instead');
    expect(friendlyFetchError('Processing failed: unreachable')).toContain('could not reach');
    expect(friendlyFetchError('Something else')).toBe('Something else');
  });
});
