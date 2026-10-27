import { describe, expect, it } from 'vitest';
import type { Guide, Trip, Weather } from '../types';
import { guideFor, latestWeather, migrateTrip, sharedInfo } from './trips';

const weather = (temp: number): Weather => ({ days: [], current: { temp, feelsLike: temp, code: 0, humidity: 50, wind: 5, time: '' } });
const guide = (mode: 'walk' | 'car', over: Partial<Guide> = {}): Guide => ({
  fetchedAt: 1,
  builtFor: { lat: 0, lon: 0, mode },
  eat: [],
  see: [],
  transit: [],
  getAround: [],
  errors: {},
  ...over,
});
const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't',
  kind: 'destination',
  place: { lat: 0, lon: 0, name: 'X', label: 'X' },
  startDate: '2026-11-01',
  endDate: '2026-11-02',
  mode: 'walk',
  createdAt: 0,
  ...over,
});

describe('guideFor', () => {
  it('returns the saved guide for the shown mode only', () => {
    const t = trip({ mode: 'car', guides: { walk: guide('walk') } });
    expect(guideFor(t)).toBeUndefined();
    expect(guideFor(t, 'walk')?.builtFor.mode).toBe('walk');
  });
});

describe('latestWeather', () => {
  it('uses whichever mode fetched weather most recently', () => {
    const t = trip({
      guides: {
        walk: guide('walk', { weather: weather(10), weatherFetchedAt: 100 }),
        car: guide('car', { weather: weather(20), weatherFetchedAt: 200 }),
      },
    });
    expect(latestWeather(t)).toEqual({ weather: weather(20), fetchedAt: 200 });
    expect(latestWeather(trip())).toBeUndefined();
  });
});

describe('sharedInfo', () => {
  it('falls back to the other mode for About and Get around', () => {
    const about = { title: 'X', extract: 'Text', url: 'u' };
    const t = trip({ mode: 'car', guides: { walk: guide('walk', { about, getAround: [{ paragraphs: ['Metro'] }] }) } });
    expect(sharedInfo(t)).toMatchObject({ about, getAround: [{ paragraphs: ['Metro'] }] });
  });
});

describe('migrateTrip', () => {
  it('moves an old single guide under its mode', () => {
    const old = { ...trip(), guide: guide('car') } as Trip & { guide: Guide };
    const t = migrateTrip(old);
    expect(t.guides?.car?.builtFor.mode).toBe('car');
    expect('guide' in t).toBe(false);
  });

  it('leaves new-style trips alone', () => {
    const t = trip({ guides: { walk: guide('walk') } });
    expect(migrateTrip(t)).toEqual(t);
  });
});
