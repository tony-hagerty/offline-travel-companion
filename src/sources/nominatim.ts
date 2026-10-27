import type { Place, TravelMode } from '../types';
import { RADIUS } from '../lib/geo';
import { fetchJson, qs } from '../lib/http';
import { elementToListing, type OsmElement, type OsmListing } from './overpass';

// Nominatim: OpenStreetMap's official geocoder. Reliable, but its usage policy allows at most
// one request per second and no search-as-you-type, so it's our fallback when Photon is down.
// https://operations.osmfoundation.org/policies/nominatim/
const BASE = 'https://nominatim.openstreetmap.org';
const MIN_GAP_MS = 1100;

let nextSlot = 0;

/** Spaces requests at least MIN_GAP_MS apart, across the whole app. */
async function throttled<T>(url: string, signal?: AbortSignal): Promise<T> {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(nextSlot, Date.now()) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  signal?.throwIfAborted();
  return fetchJson<T>(url, { signal }, 15000);
}

interface NominatimResult {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category: string;
  type: string;
  addresstype?: string;
  extratags?: Record<string, string> | null;
  address?: Record<string, string>;
}

const cityOf = (a: Record<string, string> = {}) => a.city ?? a.town ?? a.village ?? a.municipality;

export function resultToPlace(r: NominatimResult): Place {
  const a = r.address ?? {};
  const name = r.name || cityOf(a) || r.display_name.split(',')[0];
  const parts = [name, cityOf(a), a.state, a.country].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);
  return { lat: Number(r.lat), lon: Number(r.lon), name, label: parts.join(', '), countryCode: a.country_code?.toUpperCase() };
}

/** Converts a Nominatim result into the same element shape Overpass returns. */
export function resultToElement(r: NominatimResult): OsmElement | undefined {
  if (!r.name) return undefined;
  const a = r.address ?? {};
  const tags: Record<string, string> = { ...(r.extratags ?? {}), name: r.name, [r.category]: r.type };
  if (a.house_number) tags['addr:housenumber'] = a.house_number;
  if (a.road) tags['addr:street'] = a.road;
  const city = cityOf(a);
  if (city) tags['addr:city'] = city;
  return { type: r.osm_type, id: r.osm_id, lat: Number(r.lat), lon: Number(r.lon), tags };
}

/** Place search. Call only on an explicit submit, never per keystroke. */
export async function searchPlacesNominatim(query: string): Promise<Place[]> {
  const res = await throttled<NominatimResult[]>(`${BASE}/search?${qs({ q: query, format: 'jsonv2', limit: 7, addressdetails: 1, 'accept-language': 'en' })}`);
  return res.map(resultToPlace);
}

export async function reverseNominatim(lat: number, lon: number): Promise<Place> {
  const r = await throttled<NominatimResult>(`${BASE}/reverse?${qs({ lat, lon, format: 'jsonv2', zoom: 14, addressdetails: 1, 'accept-language': 'en' })}`);
  return { ...resultToPlace(r), lat, lon };
}

/** Search phrases (Nominatim "special phrases") per travel mode, with the radius for each. */
export function nominatimPhrases(mode: TravelMode): [phrase: string, radius: number][] {
  const r = RADIUS[mode];
  const phrases: [string, number][] = [
    ['restaurant', r.eatNearby],
    ['cafe', r.eatNearby],
    ['bar', r.eatNearby],
    ['fast food', r.eatNearby],
    ['museum', r.seeNotable],
    ['attraction', r.seeNotable],
    ['monument', r.seeNotable],
    ['railway station', r.station],
    ['bus station', r.station],
  ];
  if (r.busStop > 0) phrases.push(['bus stop', r.busStop]);
  return phrases;
}

/** Bounding box "west,north,east,south" around a point. */
export function viewbox(lat: number, lon: number, radius: number): string {
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((n) => n.toFixed(5)).join(',');
}

/**
 * Nearby places by category, including hours and websites. Slow (one request per second), so
 * it's only used when Photon is unavailable. Stops at the first failure, keeping what it has.
 */
export async function nearbyNominatim(lat: number, lon: number, mode: TravelMode, signal?: AbortSignal): Promise<OsmListing[]> {
  const out: OsmListing[] = [];
  for (const [phrase, radius] of nominatimPhrases(mode)) {
    const url = `${BASE}/search?${qs({
      q: `[${phrase}]`, viewbox: viewbox(lat, lon, radius), bounded: 1, format: 'jsonv2', limit: 40, extratags: 1,
      addressdetails: 1, 'accept-language': 'en',
    })}`;
    try {
      const res = await throttled<NominatimResult[]>(url, signal);
      out.push(...res.map(resultToElement).map((el) => el && elementToListing(el)).filter((l): l is OsmListing => !!l));
    } catch (err) {
      if (signal?.aborted || !out.length) throw err;
      break;
    }
  }
  return out;
}
