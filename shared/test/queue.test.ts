import { afterEach, describe, expect, it } from 'vitest';
import { queueForJob } from '../src/platform/queue/index';

describe('queueForJob', () => {
  afterEach(() => {
    delete process.env.NIM_ENABLED;
  });

  it('keeps NIM jobs on the nim queue by default', () => {
    expect(queueForJob('embed')).toBe('nim');
    expect(queueForJob('classify')).toBe('nim');
    expect(queueForJob('extract')).toBe('gemini');
  });

  it('moves NIM jobs to the gemini queue when NIM is switched off', () => {
    process.env.NIM_ENABLED = 'false';
    expect(queueForJob('embed')).toBe('gemini');
    expect(queueForJob('scan')).toBe('default');
  });
});
