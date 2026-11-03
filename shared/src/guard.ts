/**
 * Refuse to start a non-local deployment that still carries emulator / local-only settings.
 * FIREBASE_AUTH_EMULATOR_HOST is the dangerous one: with it set, the Admin SDK accepts
 * unsigned emulator tokens, so anyone could sign in as anyone.
 */
export const LOCAL_ONLY_VARS = [
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'AWS_ENDPOINT_URL',
  'S3_ENDPOINT',
] as const;

export function findLocalOnlyViolations(environment: NodeJS.ProcessEnv): string[] {
  if (environment.APP_ENV === 'local') return [];
  return LOCAL_ONLY_VARS.filter((name) => Boolean(environment[name]));
}

export function assertSafeEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  const found = findLocalOnlyViolations(environment);
  if (found.length > 0) {
    console.error(
      `Refusing to start: local-only settings present outside APP_ENV=local: ${found.join(', ')}`,
    );
    process.exit(1);
  }
}
