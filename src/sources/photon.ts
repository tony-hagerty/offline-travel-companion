import type { Place } from '../types';
import { fetchJson, qs } from '../lib/http';
import { reverseNominatim } from './nominatim';

// Photon: free OpenStreetMap geocoder built for search-as-you-type. https://photon.komoot.io
const BASE = 'https://photon.komoot.io';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    district?: string;
    locality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
    street?: string;
    housenumber?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

export function featureToPlace(f: PhotonFeature, preferCity = false): Place {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(' ') : undefined;
  const name = (preferCity ? p.city || p.locality || p.district || p.name : p.name || p.city) ?? street ?? 'Unknown place';
  const parts = [name, p.city, p.state, p.country].filter(
    (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
  );
  return { lat, lon, name, label: parts.join(', '), countryCode: p.countrycode?.toUpperCase() };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${BASE}/api/?${qs({ q: query, limit: 7, lang: 'en' })}`;
  const res = await fetchJson<PhotonResponse>(url, { signal }, 6000);
  const seen = new Set<string>();
  // Real places (cities, towns, landmarks) before administrative areas, whose center can be
  // far from anything (the "Lisbon" district's center is 30 km north of the city).
  const isArea = (f: PhotonFeature) => f.properties.osm_key === 'boundary';
  return [...res.features]
    .sort((a, b) => Number(isArea(a)) - Number(isArea(b)))
    .map((f) => {
      const place = featureToPlace(f);
      const kind = isArea(f) && f.properties.type ? ` (${f.properties.type})` : '';
      return { ...place, label: place.label.replace(place.name, `${place.name}${kind}`) };
    })
    .filter((p) => {
      if (seen.has(p.label)) return false;
      seen.add(p.label);
      return true;
    });
}

/** Place name for coordinates: Photon, or Nominatim if Photon is down. */
export async function reverseGeocode(lat: number, lon: number): Promise<Place> {
  const url = `${BASE}/reverse?${qs({ lat, lon, lang: 'en', limit: 1 })}`;
  const res = await fetchJson<PhotonResponse>(url, {}, 8000).catch(() => undefined);
  if (!res) return reverseNominatim(lat, lon);
  const f = res.features[0];
  if (!f) return { lat, lon, name: 'Current location', label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
  // Keep the user's exact coordinates; Photon returns the nearest feature's.
  return { ...featureToPlace(f, true), lat, lon };
}
