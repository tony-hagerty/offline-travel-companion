import { describe, expect, it } from 'vitest';
import { elementToListing } from './overpass';
import { featureToElement, nearbyGroups } from './nearby';

describe('featureToElement', () => {
  it('maps a Photon result to an OSM element with the same id scheme as Overpass', () => {
    const el = featureToElement({
      geometry: { coordinates: [-9.1366, 38.7077] },
      properties: {
        osm_type: 'N', osm_id: 2003731539, osm_key: 'amenity', osm_value: 'restaurant',
        name: 'Squisito', housenumber: '20', street: 'Praça do Comércio', city: 'Lisboa',
      },
    })!;
    const l = elementToListing(el)!;
    expect(l).toMatchObject({
      id: 'osm:node/2003731539', tab: 'eat', name: 'Squisito', category: 'Restaurant',
      lat: 38.7077, lon: -9.1366, address: '20 Praça do Comércio, Lisboa',
    });
  });

  it('skips results without a name or OSM type', () => {
    expect(featureToElement({ geometry: { coordinates: [0, 0] }, properties: { osm_type: 'N', osm_id: 1, osm_key: 'amenity', osm_value: 'cafe' } })).toBeUndefined();
    expect(featureToElement({ geometry: { coordinates: [0, 0] }, properties: { osm_id: 1, osm_key: 'amenity', osm_value: 'cafe', name: 'X' } })).toBeUndefined();
  });
});

describe('nearbyGroups', () => {
  it('looks up bus stops only on foot', () => {
    const tags = (mode: 'walk' | 'car') => nearbyGroups(mode).flatMap((g) => g.tags);
    expect(tags('walk')).toContain('highway:bus_stop');
    expect(tags('car')).not.toContain('highway:bus_stop');
  });
});
