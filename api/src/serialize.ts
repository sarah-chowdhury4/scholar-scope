import { Timestamp } from 'firebase-admin/firestore';

/** Firestore data → JSON the web app can read: every Timestamp, at any depth, becomes an ISO string. */
export function toPlain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]));
  }
  return value;
}
