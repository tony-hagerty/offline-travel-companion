import { describe, expect, it } from 'vitest';
import { dailyToDays, splitWeatherDates, yearBefore } from './weather';
import { chooseArticles, pickAboutTitle } from './wikivoyage';

describe('splitWeatherDates', () => {
  it('uses the forecast up to 15 days out and last year after that', () => {
    const { forecast, lastYear } = splitWeatherDates(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'], '2026-10-26');
    expect(forecast).toEqual(['2026-11-09', '2026-11-10']);
    expect(lastYear).toEqual(['2026-11-11', '2026-11-12']);
  });
});

describe('yearBefore', () => {
  it('handles leap days', () => {
    expect(yearBefore('2027-06-15')).toBe('2026-06-15');
    expect(yearBefore('2028-02-29')).toBe('2027-02-28');
  });
});

describe('dailyToDays', () => {
  it('maps last-year dates back onto trip dates', () => {
    const days = dailyToDays(
      {
        time: ['2026-03-01'],
        weather_code: [3],
        temperature_2m_max: [12],
        temperature_2m_min: [4],
        precipitation_sum: [1.2],
      },
      'lastYear',
      new Map([['2026-03-01', '2027-03-01']]),
    );
    expect(days[0]).toMatchObject({ date: '2027-03-01', kind: 'lastYear', precipChance: null, precipSum: 1.2 });
  });
});

describe('Wikivoyage article choice', () => {
  it('adds the parent city of district articles', () => {
    expect(chooseArticles(['Paris/1st arrondissement', 'Paris/2nd arrondissement', 'Paris/Le Marais', 'Paris/Other'], 'Paris')).toEqual([
      'Paris/1st arrondissement',
      'Paris',
      'Paris/2nd arrondissement',
      'Paris/Le Marais',
    ]);
  });

  it('falls back to the place name when nothing is nearby', () => {
    expect(chooseArticles([], 'Tiny Town')).toEqual(['Tiny Town']);
  });

  it('prefers the place’s own article for About', () => {
    expect(pickAboutTitle(['Paris/Le Marais', 'Paris'], 'paris')).toBe('Paris');
    expect(pickAboutTitle(['Kyoto/Gion', 'Kyoto'], 'Higashiyama')).toBe('Kyoto');
  });
});
