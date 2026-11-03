import { connect } from 'node:net';

/**
 * Scan a buffer with clamd using the INSTREAM protocol (no temp files).
 * Returns { clean: true } or { clean: false, signature }.
 */
export async function scanWithClamAV(
  data: Buffer,
  host = process.env.CLAMAV_HOST || 'localhost',
  port = Number(process.env.CLAMAV_PORT || 3310),
  timeoutMs = 60_000,
): Promise<{ clean: boolean; signature?: string; raw: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('ClamAV scan timed out'));
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const CHUNK = 64 * 1024;
      for (let i = 0; i < data.length; i += CHUNK) {
        const part = data.subarray(i, i + CHUNK);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length, 0);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
    });
    socket.on('data', (d) => chunks.push(d));
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
      if (raw.endsWith('OK')) return resolve({ clean: true, raw });
      const found = /:\s(.+)\sFOUND$/.exec(raw);
      if (found) return resolve({ clean: false, signature: found[1], raw });
      reject(new Error(`Unexpected ClamAV response: ${raw}`));
    });
  });
}
