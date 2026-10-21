const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "2 min fa", "3 h fa", "ieri", "4 giorni fa", "2 settimane fa". */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  if (diff < MIN) return 'ora';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min fa`;
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(t))) / DAY);
  if (days === 0) return `${Math.floor(diff / HOUR)} h fa`;
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return '1 settimana fa';
  if (days < 30) return `${weeks} settimane fa`;
  return new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/** "scade oggi", "scade domani", "scade tra 5 giorni", "scaduto". */
export function expiresIn(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (t <= now) return 'scaduto';
  const days = Math.round((startOfDay(new Date(t)) - startOfDay(new Date(now))) / DAY);
  if (days === 0) return 'scade oggi';
  if (days === 1) return 'scade domani';
  return `scade tra ${days} giorni`;
}

/** Like relativeTime, but "ieri 18:20" instead of "ieri". */
export function eventTime(iso: string, now = Date.now()): string {
  const rel = relativeTime(iso, now);
  if (rel === 'ieri') {
    const d = new Date(iso);
    return `ieri ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return rel;
}

export function dayBucket(iso: string, now = Date.now()): string {
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(iso))) / DAY);
  if (days === 0) return 'Oggi';
  if (days === 1) return 'Ieri';
  if (days < 7) return 'Questa settimana';
  return 'Meno recenti';
}

/** "1,4 kB", "820 B", "1,2 MB" (Italian decimal comma). */
export function fileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1).replace('.', ',')} kB`;
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`;
}

export function thousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function byteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
