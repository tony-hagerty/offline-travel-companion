import type { About, Guide, Listing, TextSection, Trip, TravelMode, Weather } from '../types';
import { happensDuring } from './events';

/** The saved guide for a mode (the trip's current mode by default). */
export function guideFor(trip: Trip, mode: TravelMode = trip.mode): Guide | undefined {
  return trip.guides?.[mode];
}

function savedGuides(trip: Trip): Guide[] {
  return Object.values(trip.guides ?? {}).filter((g): g is Guide => !!g);
}

/** Weather doesn't depend on the mode, so use the most recently fetched one. */
export function latestWeather(trip: Trip): { weather: Weather; fetchedAt: number } | undefined {
  let best: { weather: Weather; fetchedAt: number } | undefined;
  for (const g of savedGuides(trip)) {
    if (g.weather && g.weatherFetchedAt && (!best || g.weatherFetchedAt > best.fetchedAt)) {
      best = { weather: g.weather, fetchedAt: g.weatherFetchedAt };
    }
  }
  return best;
}

/** About text, header photo, "Get around", and events don't depend on the mode either. */
export function sharedInfo(trip: Trip): { about?: About; getAround: TextSection[]; getAroundSource?: string; events: Listing[] } {
  const guides = [guideFor(trip), ...savedGuides(trip)].filter((g): g is Guide => !!g);
  const about = guides.find((g) => g.about)?.about;
  const withGetAround = guides.find((g) => g.getAround.length);
  const events = guides.find((g) => g.events?.length)?.events ?? [];
  return { about, getAround: withGetAround?.getAround ?? [], getAroundSource: withGetAround?.getAroundSource, events };
}

/** A trip's events split into those that fall on its dates and the rest. */
export function splitEvents(trip: Trip): { during: Listing[]; other: Listing[] } {
  const during: Listing[] = [];
  const other: Listing[] = [];
  for (const e of sharedInfo(trip).events) {
    (e.event && happensDuring(e.event, trip.startDate, trip.endDate) ? during : other).push(e);
  }
  return { during, other };
}

/** Moves a trip saved by an older version (one `guide` field) to per-mode `guides`. */
export function migrateTrip(trip: Trip & { guide?: Guide }): Trip {
  const { guide, ...rest } = trip;
  if (!guide) return rest;
  return { ...rest, guides: { ...rest.guides, [guide.builtFor.mode]: guide } };
}
