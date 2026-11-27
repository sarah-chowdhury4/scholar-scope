import { afterEach, describe, expect, it } from 'vitest';
import { aiModel, aiProvider } from '../src/platform/ai/provider';
import { jsonFromAnswer } from '../src/platform/ai/nim';

describe('AI provider setting', () => {
  const before = { ...process.env };
  afterEach(() => {
    process.env = { ...before };
  });

  it('defaults to Gemini and accepts nim and auto', () => {
    delete process.env.AI_PROVIDER;
    expect(aiProvider()).toBe('gemini');
    process.env.AI_PROVIDER = ' NIM ';
    expect(aiProvider()).toBe('nim');
    process.env.AI_PROVIDER = 'auto';
    expect(aiProvider()).toBe('auto');
    process.env.AI_PROVIDER = 'grok';
    expect(aiProvider()).toBe('gemini');
  });

  it('names the NIM model when NIM answers', () => {
    process.env.AI_PROVIDER = 'nim';
    delete process.env.NIM_JSON_MODEL;
    expect(aiModel()).toBe('nvidia/nemotron-3.5-super-vl-120b-a12b');
  });
});

describe('jsonFromAnswer', () => {
  it('takes the JSON object out of a fenced or chatty answer', () => {
    expect(JSON.parse(jsonFromAnswer('```json\n{"items": []}\n```'))).toEqual({ items: [] });
    expect(JSON.parse(jsonFromAnswer('Here you go: {"a": 1} Hope that helps.'))).toEqual({ a: 1 });
    expect(JSON.parse(jsonFromAnswer('{"a": {"b": 2}}'))).toEqual({ a: { b: 2 } });
  });
});

