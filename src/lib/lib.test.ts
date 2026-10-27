import { describe, expect, it } from 'vitest';
import { addDays, dateRange, daysBetween, formatDateRange, timeAgo } from './dates';
import { distanceMeters, formatDistance } from './geo';
import { formatOsmHours } from './hours';

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('lists an inclusive range', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
  });

  it('formats date ranges', () => {
    expect(formatDateRange('2026-10-26', '2026-10-26', '2026-10-26')).toBe('Today');
    expect(formatDateRange('2027-03-03', '2027-03-09', '2026-10-26')).toMatch(/Mar 3 – 9, 2027/);
    expect(formatDateRange('2027-03-30', '2027-04-02', '2026-10-26')).toMatch(/Mar 30 – Apr 2, 2027/);
  });

  it('describes elapsed time', () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 30_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 hr ago');
    expect(timeAgo(now - 49 * 3600_000, now)).toBe('2 days ago');
  });
});

describe('geo', () => {
  it('measures distance', () => {
    // Eiffel Tower → Louvre is about 3.2 km.
    expect(distanceMeters(48.8584, 2.2945, 48.8606, 2.3376)).toBeGreaterThan(3100);
    expect(distanceMeters(48.8584, 2.2945, 48.8606, 2.3376)).toBeLessThan(3300);
  });

  it('shows walking minutes on foot and miles/km otherwise', () => {
    expect(formatDistance(400, 'walk', 'imperial')).toBe('5 min walk');
    expect(formatDistance(5000, 'walk', 'imperial')).toBe('3.1 mi');
    expect(formatDistance(5000, 'car', 'metric')).toBe('5.0 km');
    expect(formatDistance(25000, 'car', 'metric')).toBe('25 km');
  });
});

describe('formatOsmHours', () => {
  it('expands days and uses 12-hour times', () => {
    expect(formatOsmHours('Mo-Fr 09:00-17:00; Sa 10:00-14:30; PH off')).toEqual([
      'Mon–Fri 9 AM–5 PM',
      'Sat 10 AM–2:30 PM',
      'Holidays closed',
    ]);
  });

  it('handles 24/7, midnight, and comma lists', () => {
    expect(formatOsmHours('24/7')).toEqual(['Open 24 hours']);
    expect(formatOsmHours('Mo,We 18:00-24:00')).toEqual(['Mon, Wed 6 PM–12 AM']);
  });

  it('keeps 24-hour times when asked', () => {
    expect(formatOsmHours('Tu-Su 10:00-18:00', false)).toEqual(['Tue–Sun 10:00–18:00']);
  });
});
