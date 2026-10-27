import type { Listing, TravelMode } from '../types';
import { RADIUS, distanceMeters } from '../lib/geo';

// dedupe compares every pair of listings, so normalized names are cached.
const normalized = new Map<string, string>();

/** Lowercase, no accents, no punctuation, no leading "the". */
export function normalizeName(name: string): string {
  let n = normalized.get(name);
  if (n === undefined) {
    if (normalized.size > 20000) normalized.clear();
    n = normalizeUncached(name);
    normalized.set(name, n);
  }
  return n;
}

function normalizeUncached(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^the /, '')
    .trim();
}

function sameName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length < nb.length ? [na, nb] : [nb, na];
  return short.length >= 5 && long.includes(short);
}

/** True when two listings are very likely the same real place. */
export function isSamePlace(a: Listing, b: Listing, maxMeters = 250): boolean {
  // Cheap rejection first: ~0.01° of latitude is ~1.1 km, far beyond maxMeters.
  if (a.lat !== undefined && b.lat !== undefined && Math.abs(a.lat - b.lat) > 0.01) return false;
  if (!sameName(a.name, b.name)) return false;
  if (a.lat === undefined || b.lat === undefined || a.lon === undefined || b.lon === undefined) {
    return normalizeName(a.name) === normalizeName(b.name);
  }
  return distanceMeters(a.lat, a.lon, b.lat, b.lon) <= maxMeters;
}

/** Fills gaps in `primary` from `other`. Guide (Wikivoyage) data stays on top. */
function mergeInto(primary: Listing, other: Listing): Listing {
  const out: Listing = { ...primary };
  for (const key of ['lat', 'lon', 'distance', 'description', 'hours', 'price', 'address', 'phone', 'website', 'wikipedia', 'wikipediaTag', 'image'] as const) {
    if (out[key] === undefined && other[key] !== undefined) (out as unknown as Record<string, unknown>)[key] = other[key];
  }
  if ((other.views ?? 0) > (out.views ?? 0)) out.views = other.views;
  if (other.extra?.length) out.extra = [...new Set([...(out.extra ?? []), ...other.extra])];
  if (other.guidePick) out.guidePick = true;
  if (primary.source === 'wikivoyage' && other.category && primary.category === 'Restaurant') out.category = other.category;
  return out;
}

/** Removes duplicates, merging their details. Earlier items win ties, so pass guide picks first. */
export function dedupe(listings: Listing[], maxMeters = 250): Listing[] {
  const out: Listing[] = [];
  for (const l of listings) {
    const i = out.findIndex((o) => isSamePlace(o, l, maxMeters));
    if (i === -1) out.push(l);
    else out[i] = mergeInto(out[i], l);
  }
  return out;
}

export function withDistances<T extends Listing>(listings: T[], lat: number, lon: number): T[] {
  return listings.map((l) =>
    l.lat !== undefined && l.lon !== undefined ? { ...l, distance: distanceMeters(lat, lon, l.lat, l.lon) } : l,
  );
}

/**
 * Popularity score. Without ratings, we lean on: being a travel-guide pick, Wikipedia page
 * views, and how complete the listing is (hours, website, photo). Distance pulls it down.
 */
export function score(l: Listing, radius: number): number {
  let s = 0;
  if (l.guidePick) s += 3;
  if (l.views) s += Math.log10(l.views + 1) * 1.2;
  if (l.image) s += 0.5;
  if (l.hours) s += 0.3;
  if (l.website) s += 0.3;
  if (l.description) s += 0.3;
  if (l.price) s += 0.2;
  // Unknown location (often an event or a tour) counts as being at the edge of the search area.
  s -= Math.min((l.distance ?? radius) / radius, 2) * 1.5;
  return s;
}

/** Keeps listings within `limit` meters (curated picks get double), then sorts by score. */
export function rankListings(listings: Listing[], radius: number, limit: number, max: number): Listing[] {
  return listings
    .filter((l) => l.distance === undefined || l.distance <= (l.guidePick ? limit * 2 : limit))
    .map((l) => ({ ...l, score: score(l, radius) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, max);
}

/** Transit stops: closest first within a type, stations before stops. */
export function rankTransit(listings: (Listing & { rank?: number })[], mode: TravelMode, max = 40): Listing[] {
  const limit = RADIUS[mode].station * 1.5;
  return listings
    .filter((l) => l.distance === undefined || l.distance <= limit)
    .sort((a, b) => {
      // Group by rank only for nearby stops; a far subway station shouldn't beat a bus stop next door.
      const ra = (a.rank ?? 5) + (a.distance ?? limit) / 1000;
      const rb = (b.rank ?? 5) + (b.distance ?? limit) / 1000;
      return ra - rb;
    })
    .slice(0, max);
}
