import { describe, expect, it } from 'vitest';
import { buildQuery, classify, elementToListing, normalizeUrl, slotWaitSeconds } from './overpass';

describe('buildQuery', () => {
  it('uses walking radii and includes bus stops on foot', () => {
    const q = buildQuery(48.85, 2.35, 'walk');
    expect(q).toContain('around:1200,48.85,2.35');
    expect(q).toContain('"highway"="bus_stop"');
    expect(q).toContain('around:2400,48.85,2.35');
    expect(q).not.toContain('around:20000');
  });

  it('adds wider "notable only" searches by car and drops bus stops', () => {
    const q = buildQuery(48.85, 2.35, 'car');
    expect(q).toContain('around:20000,48.85,2.35)["amenity"~"^(restaurant|cafe|bar|pub)$"]["name"]["wikidata"]');
    expect(q).toContain('around:20000');
    expect(q).not.toContain('bus_stop');
  });
});

describe('classify', () => {
  it.each([
    [{ amenity: 'restaurant', cuisine: 'italian;pizza' }, 'eat', 'Restaurant · Italian, Pizza'],
    [{ amenity: 'cafe' }, 'eat', 'Café'],
    [{ amenity: 'pub' }, 'eat', 'Pub'],
    [{ tourism: 'museum' }, 'see', 'Museum'],
    [{ historic: 'archaeological_site' }, 'see', 'Archaeological Site'],
    [{ railway: 'station', station: 'subway' }, 'transit', 'Subway / metro station'],
    [{ highway: 'bus_stop' }, 'transit', 'Bus stop'],
  ])('%o', (tags, tab, category) => {
    const k = classify(tags as Record<string, string>);
    expect(k?.tab).toBe(tab);
    expect(k?.category).toBe(category);
  });

  it('ignores unrelated tags', () => {
    expect(classify({ shop: 'bakery' })).toBeUndefined();
  });
});

describe('elementToListing', () => {
  it('maps a restaurant node with hours, address, and extras', () => {
    const l = elementToListing({
      type: 'node',
      id: 42,
      lat: 1,
      lon: 2,
      tags: {
        amenity: 'restaurant',
        name: 'Chez Toto',
        'name:en': 'Toto’s',
        opening_hours: 'Mo-Fr 11:30-14:30; Sa off',
        'addr:housenumber': '5',
        'addr:street': 'Rue X',
        'addr:city': 'Paris',
        website: 'https://toto.fr',
        outdoor_seating: 'yes',
        'diet:vegetarian': 'yes',
      },
    })!;
    expect(l.id).toBe('osm:node/42');
    expect(l.name).toBe('Toto’s');
    expect(l.description).toBe('Local name: Chez Toto.');
    expect(l.hours).toBe('Mon–Fri 11:30 AM–2:30 PM\nSat closed');
    expect(l.address).toBe('5 Rue X, Paris');
    expect(l.extra).toEqual(['Vegetarian options', 'Outdoor seating']);
  });

  it('uses the center of ways and builds a Wikipedia link', () => {
    const l = elementToListing({
      type: 'way',
      id: 7,
      center: { lat: 3, lon: 4 },
      tags: { tourism: 'museum', name: 'Musée', wikipedia: 'fr:Musée d’Orsay', fee: 'no', wikidata: 'Q23402' },
    })!;
    expect([l.lat, l.lon]).toEqual([3, 4]);
    expect(l.price).toBe('Free');
    expect(l.wikidata).toBe('Q23402');
    expect(l.wikipedia).toBe('https://fr.wikipedia.org/wiki/Mus%C3%A9e_d%E2%80%99Orsay');
  });

  it('skips unnamed or uncategorized elements', () => {
    expect(elementToListing({ type: 'node', id: 1, lat: 0, lon: 0, tags: { amenity: 'cafe' } })).toBeUndefined();
    expect(elementToListing({ type: 'node', id: 1, lat: 0, lon: 0, tags: { name: 'X', shop: 'bakery' } })).toBeUndefined();
  });
});

describe('slotWaitSeconds', () => {
  it('returns 0 when a slot is free, else the announced wait plus a second', () => {
    expect(slotWaitSeconds('Rate limit: 2\n1 slots available now.\n')).toBe(0);
    expect(slotWaitSeconds('Rate limit: 2\n0 slots available now.\nSlot available after: x, in 9 seconds.\n')).toBe(10);
    expect(slotWaitSeconds('garbled')).toBe(5);
  });
});

describe('normalizeUrl', () => {
  it.each([
    ['https://a.pt/menu', 'https://a.pt/menu'],
    ['www.cafe.pt', 'https://www.cafe.pt'],
    ['cafe.pt/menu;https://other.pt', 'https://cafe.pt/menu'],
    ['javascript:alert(1)', undefined],
    ['ask inside', undefined],
    [undefined, undefined],
  ])('%s → %s', (input, out) => expect(normalizeUrl(input)).toBe(out));
});
