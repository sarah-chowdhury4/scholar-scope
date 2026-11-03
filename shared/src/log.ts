/**
 * One JSON line per event. Cloud Logging and `docker compose logs` both read this format,
 * and the log-based metrics key off `event` (e.g. extraction_failed, recheck_failed).
 * Never pass secrets, tokens or document text in `fields`.
 */
type Level = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

function write(severity: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ severity, event, time: new Date().toISOString(), ...fields });
  if (severity === 'ERROR') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write('DEBUG', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write('INFO', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('WARNING', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('ERROR', event, fields),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
