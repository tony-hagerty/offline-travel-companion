import { describe, expect, it } from 'vitest';
import type { Listing } from '../types';
import { dedupe, normalizeName, rankListings, rankTransit } from './merge';

const base = (over: Partial<Listing>): Listing => ({
  id: over.name ?? 'x',
  name: 'x',
  category: 'Restaurant',
  group: 'restaurant',
  source: 'osm',
  ...over,
});

describe('normalizeName', () => {
  it('ignores accents, case, punctuation, and a leading "the"', () => {
    expect(normalizeName('The Café de Flore!')).toBe('cafe de flore');
    expect(normalizeName('Ben & Jerry’s')).toBe('ben and jerry s');
  });
});

describe('dedupe', () => {
  it('merges a guide pick with the matching OSM place nearby, keeping guide data first', () => {
    const wv = base({ id: 'wv', name: 'Café de Flore', source: 'wikivoyage', guidePick: true, price: '€8 coffee', lat: 48.854, lon: 2.3326 });
    const osm = base({ id: 'osm', name: 'Cafe de Flore', lat: 48.8541, lon: 2.3327, hours: 'Daily 7:30 AM–1:30 AM', price: 'other', views: 900 });
    const out = dedupe([wv, osm]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'wv', price: '€8 coffee', hours: 'Daily 7:30 AM–1:30 AM', views: 900, guidePick: true });
  });

  it('keeps same-named places that are far apart', () => {
    const a = base({ id: 'a', name: 'Starbucks', lat: 48.85, lon: 2.35 });
    const b = base({ id: 'b', name: 'Starbucks', lat: 48.86, lon: 2.36 });
    expect(dedupe([a, b])).toHaveLength(2);
  });

  it('matches a listing without coordinates only on an exact name', () => {
    const a = base({ id: 'a', name: 'Le Comptoir', source: 'wikivoyage' });
    const b = base({ id: 'b', name: 'Le Comptoir du Relais', lat: 1, lon: 1 });
    const c = base({ id: 'c', name: 'le comptoir', lat: 1, lon: 1 });
    expect(dedupe([a, b, c]).map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('rankListings', () => {
  it('puts popular guide picks above closer but bare places', () => {
    const bare = base({ id: 'bare', distance: 50 });
    const pick = base({ id: 'pick', guidePick: true, distance: 800, views: 20000, image: 'x' });
    expect(rankListings([bare, pick], 1200, 1200, 10).map((l) => l.id)).toEqual(['pick', 'bare']);
  });

  it('drops places past the limit, allowing guide picks twice as far', () => {
    const far = base({ id: 'far', distance: 1500 });
    const farPick = base({ id: 'farPick', guidePick: true, distance: 2000 });
    const noCoords = base({ id: 'noCoords', guidePick: true });
    expect(rankListings([far, farPick, noCoords], 1200, 1200, 10).map((l) => l.id).sort()).toEqual(['farPick', 'noCoords']);
  });
});

describe('rankTransit', () => {
  it('orders by type then distance, but a close stop beats a far station', () => {
    const subwayNear = { ...base({ id: 'subwayNear', distance: 300 }), rank: 0 };
    const busNear = { ...base({ id: 'busNear', distance: 50 }), rank: 4 };
    const subwayFar = { ...base({ id: 'subwayFar', distance: 2200 }), rank: 0 };
    expect(rankTransit([busNear, subwayFar, subwayNear], 'walk').map((l) => l.id)).toEqual(['subwayNear', 'subwayFar', 'busNear']);
  });
});

describe('dedupe distances', () => {
  it('carries the OSM twin’s distance onto a guide pick without coordinates', () => {
    const wv = base({ id: 'wv', name: 'Le Comptoir', source: 'wikivoyage', guidePick: true });
    const osm = base({ id: 'osm', name: 'Le Comptoir', lat: 1, lon: 1, distance: 15000 });
    const [merged] = dedupe([wv, osm]);
    expect(merged).toMatchObject({ id: 'wv', lat: 1, distance: 15000 });
    expect(rankListings([merged], 1200, 1200, 10)).toEqual([]);
  });
});

describe('rankListings without a location', () => {
  it('ranks a located nearby pick above an otherwise-equal pick with no location', () => {
    const event = base({ id: 'event', guidePick: true, hours: 'March' });
    const sight = base({ id: 'sight', guidePick: true, hours: '9–5', distance: 300 });
    expect(rankListings([event, sight], 2500, 2500, 10).map((l) => l.id)).toEqual(['sight', 'event']);
  });
});
