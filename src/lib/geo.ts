import type { TravelMode, Units } from '../types';

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in meters. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

const WALK_M_PER_MIN = 80;

/** "6 min walk", "0.4 mi", "2.3 km" depending on mode and units. */
export function formatDistance(meters: number, mode: TravelMode, units: Units): string {
  if (mode === 'walk' && meters <= 3000) {
    const mins = Math.max(1, Math.round(meters / WALK_M_PER_MIN));
    return `${mins} min walk`;
  }
  if (units === 'imperial') {
    const miles = meters / 1609.344;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** How far she's willing to go: about a 30-minute walk (80 m/min) or a 20–30 minute drive. */
const WALK_REACH = 2400;
const DRIVE_REACH = 20000;

/**
 * Search radii in meters, per travel mode. `eat` and `see` limit the Overpass queries that return
 * every match (thousands of restaurants in a big city), so they stay small; the `Notable` radii
 * cover places with a Wikipedia entry out to the full reach. `eatNearby` is for the nearest-first
 * lookups (Photon, Nominatim), which cap their own result counts. Bus stops are only worth
 * showing when they're close.
 */
export const RADIUS = {
  walk: {
    eat: 1200, eatNearby: WALK_REACH, eatNotable: WALK_REACH,
    see: WALK_REACH, seeNotable: WALK_REACH, station: WALK_REACH, busStop: 500,
  },
  car: {
    eat: 1500, eatNearby: DRIVE_REACH, eatNotable: DRIVE_REACH,
    see: 3000, seeNotable: DRIVE_REACH, station: DRIVE_REACH, busStop: 0,
  },
} as const;

