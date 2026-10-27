import { describe, expect, it } from 'vitest';
import { describeTiming, happensDuring, hasClockTime, monthPart, monthsMentioned, weekdaysMentioned } from './events';
import { detectEvent, extractListings } from '../sources/wikitext';

describe('monthsMentioned', () => {
  it.each([
    ['April', [3]],
    ['Jun–Aug', [5, 6, 7]],
    ['late May to early June', [4, 5]],
    ['Jun 1 - Aug 15', [5, 6, 7]],
    ['Nov-Feb', [0, 1, 10, 11]],
    ['April and October', [3, 9]],
    ['you may visit any time', []],
  ])('%s', (text, months) => expect(monthsMentioned(text)).toEqual(months));
});

describe('weekdaysMentioned', () => {
  it('reads "every Tue" and plurals', () => {
    expect(weekdaysMentioned('Every Tue')).toEqual([2]);
    expect(weekdaysMentioned('Fridays and Saturdays from 9pm')).toEqual([5, 6]);
    expect(weekdaysMentioned('Mon-Sat')).toEqual([]);
  });
});

describe('hasClockTime', () => {
  it('spots opening hours', () => {
    expect(hasClockTime('Apr-Oct 09:00-18:00')).toBe(true);
    expect(hasClockTime('daily 9am')).toBe(true);
    expect(hasClockTime('April')).toBe(false);
  });
});

describe('describeTiming', () => {
  it('labels months and weekdays', () => {
    expect(describeTiming({ months: [5, 6, 7], weekdays: [] })).toBe('June – August');
    expect(describeTiming({ months: [3, 9], weekdays: [] })).toBe('Apr, Oct');
    expect(describeTiming({ months: [], weekdays: [2] })).toBe('Every Tuesday');
    expect(describeTiming({ months: [], weekdays: [] })).toBeUndefined();
  });
});

describe('happensDuring', () => {
  it('matches months against trip dates', () => {
    expect(happensDuring({ months: [3], weekdays: [] }, '2027-03-29', '2027-04-02')).toBe(true);
    expect(happensDuring({ months: [3], weekdays: [] }, '2027-05-01', '2027-05-09')).toBe(false);
  });

  it('matches weekdays, within the months when both are given', () => {
    // 2027-04-06 is a Tuesday.
    expect(happensDuring({ months: [], weekdays: [2] }, '2027-04-05', '2027-04-06')).toBe(true);
    expect(happensDuring({ months: [], weekdays: [2] }, '2027-04-07', '2027-04-09')).toBe(false);
    expect(happensDuring({ months: [4], weekdays: [2] }, '2027-04-05', '2027-04-06')).toBe(false);
  });

  it('never matches unknown timing', () => {
    expect(happensDuring({ months: [], weekdays: [] }, '2027-01-01', '2027-12-31')).toBe(false);
  });
});

describe('detectEvent', () => {
  it('treats dated activities as events but not opening hours', () => {
    expect(detectEvent('do', 'April', '', false)).toMatchObject({ months: [3], when: 'April' });
    expect(detectEvent('do', 'Every Tue', '', false)).toMatchObject({ weekdays: [2] });
    expect(detectEvent('do', 'Apr-Oct 09:00-18:00', '', false)).toBeUndefined();
    expect(detectEvent('see', 'April', '', false)).toBeUndefined();
  });

  it('counts anything in an events section, reading the description too', () => {
    expect(detectEvent('see', '', 'Held every June in the old town.', true)).toMatchObject({ months: [5], when: 'June' });
    expect(detectEvent('see', '', 'A big party.', true)).toEqual({ when: undefined, months: [], weekdays: [] });
  });
});

describe('extractListings events', () => {
  const page = `==Do==
* {{do|name=Peixe em Lisboa|hours=April|content=A food festival.}}
* {{do|name=Surf school|hours=Daily 09:00-17:00}}
===Festivals and events===
* '''Santo António''' (Jun 12–13): street parties with grilled sardines.
* {{see|name=Fado night|hours=Fridays}}
`;
  const byName = Object.fromEntries(extractListings(page, 'Lisbon').map((l) => [l.name, l]));

  it('marks dated activities, festivals-section listings, and prose bullets as events', () => {
    expect(byName['Peixe em Lisboa']).toMatchObject({ group: 'event', category: 'Festival', event: { months: [3] } });
    expect(byName['Fado night']).toMatchObject({ group: 'event', event: { weekdays: [5] } });
    expect(byName['Santo António']).toMatchObject({
      group: 'event',
      category: 'Festival',
      description: '(Jun 12–13): street parties with grilled sardines.',
      event: { months: [5], when: 'June' },
    });
  });

  it('leaves regular activities alone', () => {
    expect(byName['Surf school'].event).toBeUndefined();
    expect(byName['Surf school'].group).toBe('activity');
  });
});

describe('part of a month', () => {
  it.each([
    ['End of April', 'late'],
    ['late May', 'late'],
    ['early June', 'early'],
    ['mid-July', 'mid'],
    ['April', undefined],
    ['late May to early June', undefined],
  ])('%s → %s', (text, part) => expect(monthPart(text)).toBe(part));

  it('only matches trip days in that part of the month', () => {
    expect(happensDuring({ months: [3], weekdays: [], part: 'late' }, '2027-04-10', '2027-04-18')).toBe(false);
    expect(happensDuring({ months: [3], weekdays: [], part: 'late' }, '2027-04-18', '2027-04-22')).toBe(true);
    expect(happensDuring({ months: [3], weekdays: [], part: 'early' }, '2027-04-10', '2027-04-18')).toBe(true);
  });
});
