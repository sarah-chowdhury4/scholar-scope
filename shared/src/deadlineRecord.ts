import { Timestamp } from 'firebase-admin/firestore';
import type { DeadlineParts } from './deadlines';

/** The fields every stored deadline has (scholarship head and requirement values). */
export function deadlineRecord(parts: DeadlineParts, sourceText: string) {
  return {
    utc: Timestamp.fromDate(parts.utc),
    allDay: parts.allDay,
    sourceTimezone: parts.sourceTimezone,
    date: parts.date,
    time: parts.time,
    sourceText,
  };
}
