/**
 * Word-level comparison of two quotes for the side-by-side change view (FR-3.3).
 * Plain longest-common-subsequence over words; quotes are short (≤ 1000 characters), so this is cheap.
 */
export type DiffSegment = { type: 'same' | 'added' | 'removed'; text: string };

function tokens(text: string): string[] {
  return text.trim().split(/(\s+)/).filter((part) => part.length > 0);
}

/** Segments in reading order. "removed" text is only in `before`; "added" text is only in `after`. */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokens(before);
  const b = tokens(after);
  // Guard against pathological inputs: fall back to "all removed, all added".
  if (a.length * b.length > 400_000) {
    return [
      ...(before ? [{ type: 'removed' as const, text: before }] : []),
      ...(after ? [{ type: 'added' as const, text: after }] : []),
    ];
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffSegment[] = [];
  const push = (type: DiffSegment['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push('removed', a[i]!);
      i++;
    } else {
      push('added', b[j]!);
      j++;
    }
  }
  while (i < a.length) push('removed', a[i++]!);
  while (j < b.length) push('added', b[j++]!);
  return out;
}

/** Before/after columns for the side-by-side view. */
export function sideBySide(before: string, after: string): { before: DiffSegment[]; after: DiffSegment[] } {
  const segments = diffWords(before, after);
  return {
    before: segments.filter((segment) => segment.type !== 'added'),
    after: segments.filter((segment) => segment.type !== 'removed'),
  };
}
