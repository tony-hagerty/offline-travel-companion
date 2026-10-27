import type { Guide, Listing, Section, Trip, Weather } from '../types';
import { RADIUS, distanceMeters } from '../lib/geo';
import { addDays, todayISO } from '../lib/dates';
import { buildQuery, elementToListing, queryOverpass, type OsmListing } from '../sources/overpass';
import { fetchWikivoyage, type WikivoyageResult } from '../sources/wikivoyage';
import { enrichFromWikipedia, resolveCommonsImages, wikipediaLeadImage, wikipediaSummary } from '../sources/wikipedia';
import { fetchWeather } from '../sources/weather';
import { fetchNearby } from '../sources/nearby';
import { dedupe, rankListings, rankTransit, withDistances } from './merge';

/** The date range weather is fetched for. The current-location entry shows the coming week. */
export function weatherDates(trip: Trip, today = todayISO()): [string, string] {
  if (trip.kind === 'current') return [today, addDays(today, 6)];
  return [trip.startDate, trip.endDate];
}

const message = (r: PromiseSettledResult<unknown>) =>
  r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : undefined;

export interface WeatherUpdate {
  weather?: Weather;
  weatherFetchedAt?: number;
  timezone?: string;
  error?: string;
}

/** Fetches weather for the trip's dates. Never throws; failures come back as `error`. */
export async function refreshWeather(trip: Trip): Promise<WeatherUpdate> {
  const [start, end] = weatherDates(trip);
  try {
    const weather = await fetchWeather(trip.place.lat, trip.place.lon, start, end, todayISO());
    return { weather, weatherFetchedAt: Date.now(), timezone: weather.timezone };
  } catch (err) {
    return { error: String((err as Error).message) };
  }
}

/** Applies a weather update to a guide, keeping the old weather if the update failed. */
export function applyWeather(guide: Guide, w: WeatherUpdate): Guide {
  return {
    ...guide,
    weather: w.weather ?? guide.weather,
    weatherFetchedAt: w.weatherFetchedAt ?? guide.weatherFetchedAt,
    timezone: w.timezone ?? guide.timezone,
    errors: { ...guide.errors, weather: w.error },
  };
}

/**
 * Fetches everything for a trip, for its current mode, from all sources. Sections that fail keep their previous data.
 * Overpass (OpenStreetMap details like hours) is often slow, so `onPartial` gets a guide built
 * from the faster sources while it waits.
 */
export async function buildGuide(trip: Trip, onPartial?: (g: Guide) => void, signal?: AbortSignal): Promise<Guide> {
  const { lat, lon } = trip.place;
  const prev = trip.guides?.[trip.mode];
  const radius = RADIUS[trip.mode];

  const osmPromise = queryOverpass(buildQuery(lat, lon, trip.mode), signal).then((els) =>
    els.map(elementToListing).filter((l): l is OsmListing => !!l),
  );
  const nearbyPromise = fetchNearby(lat, lon, trip.mode, signal);
  // Both are awaited later; these handlers stop an early rejection from being reported as unhandled.
  osmPromise.catch(() => undefined);
  nearbyPromise.catch(() => undefined);
  const [wvRes, weatherRes, photoRes] = await Promise.allSettled([
    fetchWikivoyage(trip.place),
    refreshWeather(trip),
    wikipediaLeadImage(trip.place.name),
  ]);

  const wv: WikivoyageResult = wvRes.status === 'fulfilled' ? wvRes.value : { listings: [], getAround: [] };
  /** Filled in once the nearby lookup finishes; `assemble` reads whatever is there. */
  let nearby: OsmListing[] = [];
  // Festivals and recurring events get their own list instead of competing with sights.
  const wvEvents = wv.listings.filter((l) => l.event);
  const wvEat = wv.listings.filter((l) => !l.event && (l.kind === 'eat' || l.kind === 'drink'));
  const wvSee = wv.listings.filter((l) => !l.event && (l.kind === 'see' || l.kind === 'do'));
  const wvGo = wv.listings.filter((l) => l.kind === 'go' && l.lat !== undefined);
  await Promise.allSettled([enrichFromWikipedia([...wvSee, ...wvEat, ...wvEvents]), resolveCommonsImages(wv.listings)]);

  const aboutText = wv.about ?? (await wikipediaSummary(trip.place.name).catch(() => undefined)) ?? prev?.about;
  const photo = photoRes.status === 'fulfilled' ? photoRes.value : undefined;
  const about = aboutText && { ...aboutText, image: photo ?? aboutText.image };
  const weather: WeatherUpdate = weatherRes.status === 'fulfilled' ? weatherRes.value : {};
  const build = (curated: Listing[], nearby: Listing[]) => dedupe(withDistances([...curated, ...nearby], lat, lon));

  const prevUsable =
    !!prev &&
    !prev.partial &&
    prev.builtFor.mode === trip.mode &&
    distanceMeters(prev.builtFor.lat, prev.builtFor.lon, lat, lon) <= 300;

  /** `osmRes` is undefined while Overpass is still loading. */
  const assemble = (osmRes?: PromiseSettledResult<OsmListing[]>): Guide => {
    // Overpass first: when the same place comes from both, its richer entry (hours, website) is kept.
    const osm = [...(osmRes?.status === 'fulfilled' ? osmRes.value : []), ...nearby];
    const osmFailed = osmRes?.status === 'rejected';
    // When Overpass fails, a complete earlier guide for the same spot beats a thinner new one.
    const keepPrev = osmFailed && prevUsable;
    const placesFailed = wvRes.status === 'rejected' && osmFailed && !nearby.length;
    const errors: Partial<Record<Section, string>> = {};
    const wvErr = message(wvRes);
    const osmErr =
      osmRes && message(osmRes) && (nearby.length ? 'Some hours and details may be missing — map servers are busy' : message(osmRes));
    if (osmErr ?? wvErr) errors.eat = errors.see = osmErr ?? wvErr;
    if (osmErr) errors.transit = osmErr;
    if (wvErr) errors.about = wvErr;
    if (weather.error) errors.weather = weather.error;

    return {
      fetchedAt: Date.now(),
      partial: !osmRes || (osmFailed && !keepPrev) || undefined,
      builtFor: { lat, lon, mode: trip.mode },
      timezone: weather.timezone ?? prev?.timezone,
      about,
      eat: keepPrev || placesFailed
        ? (prevUsable ? prev!.eat : [])
        : rankListings(build(wvEat, osm.filter((l) => l.tab === 'eat')), radius.eatNearby, Math.max(radius.eatNearby, radius.eatNotable), 80),
      see: keepPrev || placesFailed
        ? (prevUsable ? prev!.see : [])
        : rankListings(build(wvSee, osm.filter((l) => l.tab === 'see')), radius.see, radius.seeNotable, 60),
      transit: keepPrev
        ? prev!.transit
        : rankTransit(dedupe(withDistances([...wvGo, ...osm.filter((l) => l.tab === 'transit')], lat, lon), 400), trip.mode),
      events: wvRes.status === 'fulfilled' ? dedupe(wvEvents) : (prev?.events ?? []),
      getAround: wv.getAround.length ? wv.getAround : (prev?.getAround ?? []),
      getAroundSource: wv.getAround.length ? wv.getAroundSource : prev?.getAroundSource,
      weather: weather.weather ?? prev?.weather,
      weatherFetchedAt: weather.weatherFetchedAt ?? prev?.weatherFetchedAt,
      errors,
    };
  };

  // Show results in stages (guide picks, then nearby places) unless the current lists are
  // still right for this spot and mode.
  const showProgress = !!onPartial && !prevUsable;
  if (showProgress) onPartial(assemble());
  const [nearbyRes] = await Promise.allSettled([nearbyPromise]);
  if (nearbyRes.status === 'fulfilled') nearby = nearbyRes.value;
  if (showProgress) onPartial(assemble());

  const [osmRes] = await Promise.allSettled([osmPromise]);
  if (osmRes.status === 'fulfilled') {
    // Photos and popularity. Only the closest linked places are worth the extra requests.
    const linked = withDistances(osmRes.value, lat, lon)
      .filter((l) => l.tab !== 'transit' && (l.wikidata || l.wikipediaTag))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 150);
    const ids = new Set(linked.map((l) => l.id));
    await enrichFromWikipedia(osmRes.value.filter((l) => ids.has(l.id))).catch(() => undefined);
  }
  return assemble(osmRes);
}

/** Every photo URL in a guide, so they can be downloaded for offline use. */
export function guideImages(guide: Guide): string[] {
  const urls = [guide.about?.image, ...[...guide.eat, ...guide.see].map((l) => l.image)];
  return [...new Set(urls.filter((u): u is string => !!u))];
}

/**
 * Downloads photos so the service worker caches them for offline viewing.
 * Runs a few at a time; failures are ignored (the photo just won't show offline).
 */
export async function prefetchImages(urls: string[], concurrency = 4): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      await fetch(url, { mode: 'cors' }).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}
