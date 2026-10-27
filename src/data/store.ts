import { useSyncExternalStore } from 'react';
import type { Guide, Place, Trip, TravelMode, Units } from '../types';
import { loadTrips, removeTrip, saveTrip } from './db';
import { applyWeather, buildGuide, guideImages, prefetchImages, refreshWeather } from '../guide/build';
import { distanceMeters } from '../lib/geo';
import { todayISO } from '../lib/dates';
import { guideFor } from '../lib/trips';
import { reverseGeocode } from '../sources/photon';

// App state: the trip list plus what's downloading. Components read it with useStore().
//
// Saved data only changes when she asks for it (the refresh button, editing a trip, the first
// "Where am I?" tap) or when a mode is opened for the first time.

export interface State {
  loaded: boolean;
  trips: Trip[];
  /** Keys from busyKey() for downloads in progress. */
  busy: Record<string, true>;
  units: Units;
  locationEnabled: boolean;
  locationError?: string;
}

/** Key for a trip's download in one mode, or for its weather-only update. */
export function busyKey(id: string, what: TravelMode | 'weather'): string {
  return `${id}:${what}`;
}

const UNITS_KEY = 'units';
const LOCATION_KEY = 'locationEnabled';

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode etc. The setting just won't persist.
  }
}

const defaultUnits: Units = /^en-(US|LR|MM)$/i.test(navigator.language) ? 'imperial' : 'metric';

let state: State = {
  loaded: false,
  trips: [],
  busy: {},
  units: (readSetting(UNITS_KEY) as Units | null) ?? defaultUnits,
  locationEnabled: readSetting(LOCATION_KEY) === '1',
};

const listeners = new Set<() => void>();

function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function getTrip(id: string): Trip | undefined {
  return state.trips.find((t) => t.id === id);
}

async function putTrip(trip: Trip): Promise<void> {
  const exists = state.trips.some((t) => t.id === trip.id);
  set({ trips: exists ? state.trips.map((t) => (t.id === trip.id ? trip : t)) : [...state.trips, trip] });
  await saveTrip(trip);
}

function setBusy(key: string, on: boolean): void {
  const busy = { ...state.busy };
  if (on) busy[key] = true;
  else delete busy[key];
  set({ busy });
}

export async function init(): Promise<void> {
  set({ trips: await loadTrips(), loaded: true });
}

export function setUnits(units: Units): void {
  writeSetting(UNITS_KEY, units);
  set({ units });
}

export async function createTrip(place: Place, startDate: string, endDate: string, mode: TravelMode): Promise<Trip> {
  const trip: Trip = {
    id: crypto.randomUUID(),
    kind: 'destination',
    place,
    startDate,
    endDate,
    mode,
    createdAt: Date.now(),
  };
  await putTrip(trip);
  void refreshTrip(trip.id);
  return trip;
}

export async function updateTrip(id: string, patch: Partial<Pick<Trip, 'place' | 'startDate' | 'endDate' | 'mode'>>): Promise<void> {
  const trip = getTrip(id);
  if (!trip) return;
  const placeChanged = !!patch.place && patch.place !== trip.place;
  // A new destination makes both modes' saved results wrong.
  const next: Trip = { ...trip, ...patch, ...(placeChanged ? { guides: {} } : {}) };
  if (placeChanged) cancelDownloads(id);
  await putTrip(next);
  ensureGuide(id);
  const datesChanged = (patch.startDate && patch.startDate !== trip.startDate) || (patch.endDate && patch.endDate !== trip.endDate);
  if (datesChanged && !placeChanged) void refreshTripWeather(id);
}

export async function deleteTrip(id: string): Promise<void> {
  cancelDownloads(id);
  set({ trips: state.trips.filter((t) => t.id !== id) });
  await removeTrip(id);
}

/** In-progress downloads by busyKey, so they can be canceled. */
const downloads = new Map<string, AbortController>();

function cancelDownloads(id: string): void {
  for (const mode of ['walk', 'car'] as const) downloads.get(busyKey(id, mode))?.abort();
}

/** Downloads the current mode's results the first time that mode is shown. */
export function ensureGuide(id: string): void {
  const trip = getTrip(id);
  if (trip && !guideFor(trip)) void refreshTrip(id);
}

/** Downloads everything for one mode of a trip (its current mode by default). No-op offline or if already running. */
export async function refreshTrip(id: string, mode?: TravelMode): Promise<void> {
  const trip = getTrip(id);
  if (!trip || !navigator.onLine) return;
  const m = mode ?? trip.mode;
  const key = busyKey(id, m);
  if (downloads.has(key)) return;
  const ctrl = new AbortController();
  downloads.set(key, ctrl);
  setBusy(key, true);
  try {
    // Save onto the latest copy of the trip, unless its destination changed meanwhile.
    const save = async (guide: Guide) => {
      const latest = getTrip(id);
      if (!latest || ctrl.signal.aborted || latest.place !== trip.place) return;
      await putTrip({ ...latest, guides: { ...latest.guides, [m]: guide } });
    };
    const guide = await buildGuide({ ...trip, mode: m }, (partial) => void save(partial), ctrl.signal);
    await save(guide);
    if (!ctrl.signal.aborted) void prefetchImages(guideImages(guide));
  } finally {
    downloads.delete(key);
    setBusy(key, false);
  }
  // Dates edited while we were fetching got weather for the old dates.
  const latest = getTrip(id);
  if (latest && !ctrl.signal.aborted && (latest.startDate !== trip.startDate || latest.endDate !== trip.endDate)) {
    void refreshTripWeather(id);
  }
}

/** Re-fetches weather (after a date change) and saves it into every mode's guide. */
export async function refreshTripWeather(id: string): Promise<void> {
  const trip = getTrip(id);
  const key = busyKey(id, 'weather');
  if (!trip?.guides || state.busy[key] || !navigator.onLine) return;
  setBusy(key, true);
  try {
    const update = await refreshWeather(trip);
    const latest = getTrip(id);
    if (!latest?.guides) return;
    const guides = Object.fromEntries(
      Object.entries(latest.guides).map(([mode, g]) => [mode, g && applyWeather(g, update)]),
    ) as Trip['guides'];
    await putTrip({ ...latest, guides });
  } finally {
    setBusy(key, false);
  }
}

// ---- Current location ----

const CURRENT_ID = 'current';
/** A mode's saved results are for the wrong spot once she's moved this far. */
const MOVE_THRESHOLD_M: Record<TravelMode, number> = { walk: 500, car: 3000 };

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60000 }),
  );
}

/** Turns on the current-location entry. Call from a tap so iOS shows the permission prompt. */
export async function enableLocation(): Promise<void> {
  writeSetting(LOCATION_KEY, '1');
  set({ locationEnabled: true });
  await updateCurrentLocation();
}

/**
 * Re-checks where she is and re-downloads the shown mode. Only runs when she taps (the first
 * "Where am I?" or the refresh button). The other mode's saved results are kept if she hasn't
 * moved far enough for them to be wrong.
 */
export async function updateCurrentLocation(): Promise<void> {
  if (!state.locationEnabled || !navigator.onLine || !('geolocation' in navigator)) return;
  let pos: GeolocationPosition;
  try {
    pos = await getPosition();
    set({ locationError: undefined });
  } catch (err) {
    const e = err as GeolocationPositionError;
    set({ locationError: e.code === 1 ? 'Location permission is off for this app.' : 'Couldn’t get your location.' });
    return;
  }
  const { latitude: lat, longitude: lon } = pos.coords;
  const existing = getTrip(CURRENT_ID);
  const today = todayISO();
  const moved = existing ? distanceMeters(existing.place.lat, existing.place.lon, lat, lon) : Infinity;
  const stillValid = (mode: TravelMode) => moved < MOVE_THRESHOLD_M[mode];
  const mode = existing?.mode ?? 'walk';

  const place =
    existing && stillValid('walk')
      ? existing.place
      : await reverseGeocode(lat, lon).catch(() => ({ lat, lon, name: 'Current location', label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }));
  if (place !== existing?.place) cancelDownloads(CURRENT_ID);
  // Keep whichever mode's results are still right for where she is now.
  const guides: Trip['guides'] = {};
  for (const m of ['walk', 'car'] as const) {
    if (existing?.guides?.[m] && stillValid(m)) guides[m] = existing.guides[m];
  }
  await putTrip({
    id: CURRENT_ID,
    kind: 'current',
    place,
    startDate: today,
    endDate: today,
    mode,
    createdAt: existing?.createdAt ?? Date.now(),
    guides,
  });
  await refreshTrip(CURRENT_ID);
}
