import type { TravelMode } from '../types';
import { RADIUS } from '../lib/geo';
import { fetchJson } from '../lib/http';
import { elementToListing, type OsmElement, type OsmListing } from './overpass';
import { nearbyNominatim } from './nominatim';

// Nearby places from Photon's reverse lookup filtered by OpenStreetMap category. Much faster and
// more reliable than Overpass, but it only returns names, addresses, and locations (no hours,
// cuisine, or websites), so Overpass still fills in details when it responds.
const BASE = 'https://photon.komoot.io/reverse';

interface Group {
  tags: string[];
  radius: number;
}

/**
 * Category groups to look up. Each request returns at most 50 nearest places. Photon is a free
 * shared service that blocks bursts, so this is kept to a handful of requests.
 */
export function nearbyGroups(mode: TravelMode): Group[] {
  const r = RADIUS[mode];
  const groups: Group[] = [
    { tags: ['amenity:restaurant', 'amenity:food_court', 'amenity:fast_food'], radius: r.eatNearby },
    { tags: ['amenity:cafe', 'amenity:ice_cream', 'amenity:bar', 'amenity:pub', 'amenity:biergarten'], radius: r.eatNearby },
    {
      tags: ['tourism:museum', 'tourism:gallery', 'tourism:attraction', 'tourism:viewpoint', 'tourism:zoo', 'tourism:aquarium', 'tourism:theme_park'],
      radius: r.seeNotable,
    },
    { tags: ['historic:castle', 'historic:monument', 'historic:ruins', 'historic:archaeological_site', 'historic:fort', 'historic:palace'], radius: r.seeNotable },
    { tags: ['railway:station', 'railway:halt', 'aerialway:station', 'amenity:bus_station', 'amenity:ferry_terminal'], radius: r.station },
  ];
  if (r.busStop > 0) groups.push({ tags: ['highway:bus_stop', 'railway:tram_stop'], radius: r.busStop });
  return groups;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}

const OSM_TYPE: Record<string, OsmElement['type']> = { N: 'node', W: 'way', R: 'relation' };

/** Converts a Photon result into the same element shape Overpass returns. */
export function featureToElement(f: PhotonFeature): OsmElement | undefined {
  const p = f.properties;
  const type = OSM_TYPE[String(p.osm_type)];
  if (!type || !p.osm_key || !p.osm_value || !p.name) return undefined;
  const [lon, lat] = f.geometry.coordinates;
  const tags: Record<string, string> = { name: String(p.name), [String(p.osm_key)]: String(p.osm_value) };
  if (p.housenumber) tags['addr:housenumber'] = String(p.housenumber);
  if (p.street) tags['addr:street'] = String(p.street);
  if (p.city) tags['addr:city'] = String(p.city);
  return { type, id: Number(p.osm_id), lat, lon, tags };
}

async function lookup(lat: number, lon: number, group: Group, signal?: AbortSignal): Promise<OsmListing[]> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(group.radius / 1000), limit: '50' });
  for (const tag of group.tags) params.append('osm_tag', tag);
  const res = await fetchJson<{ features: PhotonFeature[] }>(`${BASE}?${params}`, { signal }, 6000);
  return res.features
    .map(featureToElement)
    .map((el) => el && elementToListing(el))
    .filter((l): l is OsmListing => !!l);
}

/**
 * All nearby places for a trip, one request at a time. If Photon fails before returning
 * anything (down or throttling us), falls back to Nominatim.
 */
export async function fetchNearby(lat: number, lon: number, mode: TravelMode, signal?: AbortSignal): Promise<OsmListing[]> {
  const out: OsmListing[] = [];
  for (const group of nearbyGroups(mode)) {
    try {
      out.push(...(await lookup(lat, lon, group, signal)));
    } catch (err) {
      if (signal?.aborted) throw err;
      if (!out.length) return nearbyNominatim(lat, lon, mode, signal);
      break;
    }
  }
  return out;
}
