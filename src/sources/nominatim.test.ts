import { describe, expect, it } from 'vitest';
import { elementToListing } from './overpass';
import { nominatimPhrases, resultToElement, resultToPlace, viewbox } from './nominatim';

const restaurant = {
  osm_type: 'way' as const,
  osm_id: 243451511,
  lat: '38.71',
  lon: '-9.13',
  name: 'Zuru Japanese Street Food',
  display_name: 'Zuru, Rua X, Lisboa, Portugal',
  category: 'amenity',
  type: 'restaurant',
  extratags: { cuisine: 'japanese', opening_hours: 'Mo-Su 11:00-23:00', website: 'https://zuru.com/' },
  address: { house_number: '5', road: 'Rua X', city: 'Lisboa', country: 'Portugal', country_code: 'pt' },
};

describe('resultToElement', () => {
  it('keeps Nominatim extra tags so listings get hours, cuisine, and website', () => {
    const l = elementToListing(resultToElement(restaurant)!)!;
    expect(l).toMatchObject({
      id: 'osm:way/243451511',
      tab: 'eat',
      category: 'Restaurant · Japanese',
      hours: 'Mon–Sun 11 AM–11 PM',
      website: 'https://zuru.com/',
      address: '5 Rua X, Lisboa',
      lat: 38.71,
    });
  });

  it('skips unnamed results', () => {
    expect(resultToElement({ ...restaurant, name: '' })).toBeUndefined();
  });
});

describe('resultToPlace', () => {
  it('builds a short name and label', () => {
    expect(resultToPlace({ ...restaurant, name: 'Lisbon', address: { city: 'Lisboa', country: 'Portugal', country_code: 'pt' } })).toEqual({
      lat: 38.71,
      lon: -9.13,
      name: 'Lisbon',
      label: 'Lisbon, Lisboa, Portugal',
      countryCode: 'PT',
    });
  });
});

describe('viewbox', () => {
  it('spans the radius in each direction', () => {
    const [w, n, e, s] = viewbox(0, 0, 1113.2).split(',').map(Number);
    expect([w, n, e, s]).toEqual([-0.01, 0.01, 0.01, -0.01]);
  });
});

describe('nominatimPhrases', () => {
  it('asks for bus stops only on foot', () => {
    expect(nominatimPhrases('walk').map(([p]) => p)).toContain('bus stop');
    expect(nominatimPhrases('car').map(([p]) => p)).not.toContain('bus stop');
  });
});
