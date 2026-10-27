import { describe, expect, it } from 'vitest';
import { monthGrid, pickDay } from './DateRangeSheet';

describe('monthGrid', () => {
  it('pads to the first weekday and lists every day', () => {
    // November 2026 starts on a Sunday; March 2027 on a Monday.
    expect(monthGrid(2026, 10).slice(0, 2)).toEqual(['2026-11-01', '2026-11-02']);
    const march = monthGrid(2027, 2);
    expect(march[0]).toBeNull();
    expect(march[1]).toBe('2027-03-01');
    expect(march.filter(Boolean)).toHaveLength(31);
  });
});

describe('pickDay', () => {
  it('first tap sets the start, second sets the end', () => {
    expect(pickDay(undefined, undefined, '2027-03-03')).toEqual({ start: '2027-03-03' });
    expect(pickDay('2027-03-03', undefined, '2027-03-09')).toEqual({ start: '2027-03-03', end: '2027-03-09' });
  });

  it('starts over when a range is complete or the tap is before the start', () => {
    expect(pickDay('2027-03-03', '2027-03-09', '2027-04-01')).toEqual({ start: '2027-04-01' });
    expect(pickDay('2027-03-03', undefined, '2027-03-01')).toEqual({ start: '2027-03-01' });
  });

  it('allows a one-day trip by tapping the same day twice', () => {
    expect(pickDay('2027-03-03', undefined, '2027-03-03')).toEqual({ start: '2027-03-03', end: '2027-03-03' });
  });
});
