import { describe, expect, it } from 'vitest';
import { findLocalOnlyViolations } from '../src/guard';

describe('findLocalOnlyViolations', () => {
  it('allows emulator settings when APP_ENV=local', () => {
    expect(findLocalOnlyViolations({ APP_ENV: 'local', FIREBASE_AUTH_EMULATOR_HOST: 'firebase:9099' })).toEqual([]);
  });
  it('flags emulator settings anywhere else', () => {
    expect(findLocalOnlyViolations({ APP_ENV: 'demo', FIREBASE_AUTH_EMULATOR_HOST: 'x', S3_ENDPOINT: 'y' })).toEqual([
      'FIREBASE_AUTH_EMULATOR_HOST',
      'S3_ENDPOINT',
    ]);
  });
  it('flags them when APP_ENV is missing', () => {
    expect(findLocalOnlyViolations({ FIRESTORE_EMULATOR_HOST: 'x' })).toEqual(['FIRESTORE_EMULATOR_HOST']);
  });
});
