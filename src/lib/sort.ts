import type { Entry } from '@/api';

export type SortOrder = 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'size-desc' | 'size-asc';

export const DEFAULT_SORT: SortOrder = 'name-asc';

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'name-asc', label: 'Nome (A–Z)' },
  { value: 'name-desc', label: 'Nome (Z–A)' },
  { value: 'date-desc', label: 'Più recenti' },
  { value: 'date-asc', label: 'Meno recenti' },
  { value: 'size-desc', label: 'Più grandi' },
  { value: 'size-asc', label: 'Più piccoli' },
];

export const isSortOrder = (v: unknown): v is SortOrder => SORT_OPTIONS.some((o) => o.value === v);

/** Size of an entry: bytes for a file, number of files for a folder. */
const sizeOf = (e: Entry) => (e.kind === 'file' ? e.size : e.fileCount);

const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** A sorted copy; ties fall back to the name so the order is stable. */
export function sortEntries<T extends Entry>(entries: readonly T[], order: SortOrder): T[] {
  const [key, dir] = order.split('-') as ['name' | 'date' | 'size', 'asc' | 'desc'];
  const sign = dir === 'asc' ? 1 : -1;
  const compare = (a: T, b: T) => {
    if (key === 'name') return sign * byName(a, b);
    const d = key === 'date' ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt) : sizeOf(a) - sizeOf(b);
    return sign * d || byName(a, b);
  };
  return [...entries].sort(compare);
}
