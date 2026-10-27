/** Today's date as YYYY-MM-DD in the device's local time. */
export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses YYYY-MM-DD as a local date (not UTC, which can shift the day). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);
}

/** Every date from start to end inclusive. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Mar 3 – 9, 2027", "Mar 30 – Apr 2, 2027", or "Today". */
export function formatDateRange(start: string, end: string, today = todayISO()): string {
  if (start === end && start === today) return 'Today';
  const s = parseISODate(start);
  const e = parseISODate(end);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  const sameYear = s.getFullYear() === e.getFullYear();
  if (start === end) {
    return s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (sameYear && s.getMonth() === e.getMonth()) {
    return `${month(s)} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    return `${month(s)} ${s.getDate()} – ${month(e)} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${month(s)} ${s.getDate()}, ${s.getFullYear()} – ${month(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

/** "just now", "5 min ago", "3 hr ago", "2 days ago". */
export function timeAgo(ts: number, now = Date.now()): string {
  const mins = Math.floor((now - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
