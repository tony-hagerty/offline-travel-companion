import type { EventTiming } from '../types';
import { dateRange, parseISODate } from './dates';

// Works out when a festival or recurring event happens from travel-guide text like
// "April", "Jun–Aug", "late May to early June", or "every Tuesday".

// Capitalized only, so "may" in "you may…" isn't read as a month.
const MONTH_RE = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/g;
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Words allowed between two months for them to count as a range ("Jun 1 – late Aug"). */
const RANGE_GAP = /^(?:early|mid|late|end of|the end of|beginning of|[\d\s,.]|st|nd|rd|th)*(?:-|–|—|to|until|till|through|thru)(?:early|mid|late|end of|the end of|beginning of|[\d\s,.]|st|nd|rd|th)*$/i;

/** Months (0–11) a text mentions, with ranges like "Jun–Aug" filled in (wrapping past December). */
export function monthsMentioned(text: string): number[] {
  const hits = [...text.matchAll(MONTH_RE)].map((m) => ({
    month: MONTH_KEYS.indexOf(m[1].slice(0, 3).toLowerCase()),
    start: m.index!,
    end: m.index! + m[0].length,
  }));
  const months = new Set<number>();
  hits.forEach((h, i) => {
    months.add(h.month);
    const next = hits[i + 1];
    if (next && RANGE_GAP.test(text.slice(h.end, next.start).trim().replace(/\s+/g, ' '))) {
      for (let m = h.month; m !== next.month; m = (m + 1) % 12) months.add(m);
    }
  });
  return [...months].sort((a, b) => a - b);
}

/** "early April" → early; "late May" / "end of May" → late. Only when exactly one month is named. */
export function monthPart(text: string): EventTiming['part'] {
  const hits = [...text.matchAll(MONTH_RE)];
  if (hits.length !== 1) return undefined;
  const before = text.slice(0, hits[0].index).toLowerCase();
  if (/(?:^|\W)(?:early|beginning of|start of)\s*$/.test(before)) return 'early';
  if (/(?:^|\W)(?:mid|middle of|mid-)\s*-?\s*$/.test(before)) return 'mid';
  if (/(?:^|\W)(?:late|end of|the end of)\s*$/.test(before)) return 'late';
  return undefined;
}

/** Days of the month each part covers. */
const PART_DAYS = { early: [1, 10], mid: [11, 20], late: [21, 31] } as const;

/** Weekdays (0 = Sunday) from "every Tue", "each Friday", or "Tuesdays". */
export function weekdaysMentioned(text: string): number[] {
  const days = new Set<number>();
  for (const m of text.matchAll(/\b(?:every|each)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/gi)) {
    days.add(DAY_KEYS.indexOf(m[1].toLowerCase()));
  }
  for (const m of text.matchAll(/\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days\b/gi)) {
    days.add(DAY_KEYS.indexOf(m[1].slice(0, 3).toLowerCase()));
  }
  return [...days].sort((a, b) => a - b);
}

/** True for clock times like 09:00, 9.30, 9am — the sign of opening hours rather than an event date. */
export function hasClockTime(text: string): boolean {
  return /\b\d{1,2}[:.h]\d{2}\b|\b\d{1,2}\s?(?:am|pm)\b/i.test(text);
}

/** Short label like "April", "June – August", or "Every Tuesday" when the guide gave none. */
export function describeTiming(t: Pick<EventTiming, 'months' | 'weekdays'>): string | undefined {
  const parts: string[] = [];
  if (t.weekdays.length) parts.push(`Every ${t.weekdays.map((d) => DAY_NAMES[d]).join(', ')}`);
  if (t.months.length === 1) parts.push(MONTH_NAMES[t.months[0]]);
  else if (t.months.length > 1) {
    const contiguous = t.months.every((m, i) => i === 0 || m === t.months[i - 1] + 1);
    parts.push(
      contiguous
        ? `${MONTH_NAMES[t.months[0]]} – ${MONTH_NAMES[t.months[t.months.length - 1]]}`
        : t.months.map((m) => MONTH_NAMES[m].slice(0, 3)).join(', '),
    );
  }
  return parts.length ? parts.join(' in ') : undefined;
}

/**
 * True if the event falls on any day of the trip. With both months and weekdays it must be a
 * matching weekday within a matching month. Events with no known timing never match.
 */
export function happensDuring(t: Pick<EventTiming, 'months' | 'weekdays' | 'part'>, start: string, end: string): boolean {
  if (!t.months.length && !t.weekdays.length) return false;
  const [from, to] = t.part ? PART_DAYS[t.part] : [1, 31];
  return dateRange(start, end)
    .slice(0, 366)
    .some((iso) => {
      const d = parseISODate(iso);
      const inMonth = !t.months.length || (t.months.includes(d.getMonth()) && d.getDate() >= from && d.getDate() <= to);
      return inMonth && (!t.weekdays.length || t.weekdays.includes(d.getDay()));
    });
}
