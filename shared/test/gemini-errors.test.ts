import { describe, expect, it } from 'vitest';
import { isBusyError, isQuotaError, withBusyRetry } from '../src/platform/ai/gemini';

const busy = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
const quota = new Error('{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}');

describe('Gemini errors', () => {
  it('tells a busy model from a used-up quota', () => {
    expect(isBusyError(busy)).toBe(true);
    expect(isQuotaError(busy)).toBe(false);
    expect(isQuotaError(quota)).toBe(true);
    expect(isBusyError(quota)).toBe(false);
  });

  it('retries a busy model, but not a used-up quota', async () => {
    let calls = 0;
    await expect(withBusyRetry(async () => { calls++; if (calls < 3) throw busy; return 'ok'; }, [1, 1])).resolves.toBe('ok');
    expect(calls).toBe(3);
    calls = 0;
    await expect(withBusyRetry(async () => { calls++; throw quota; }, [1, 1])).rejects.toBe(quota);
    expect(calls).toBe(1);
  });
});
