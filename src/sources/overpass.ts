import type { Listing, TravelMode } from '../types';
import { RADIUS } from '../lib/geo';
import { formatOsmHours } from '../lib/hours';
import { HttpError, fetchJson } from '../lib/http';

// Overpass: read-only query API for OpenStreetMap data. The public servers are free but often
// busy: the main one allows 2 queries at a time per IP and answers 502/429 when both are taken.
const MAIN = 'https://overpass-api.de/api/interpreter';
const STATUS = 'https://overpass-api.de/api/status';
const ATTEMPTS: [url: string, timeoutMs: number][] = [
  [MAIN, 90000],
  [MAIN, 90000],
  ['https://overpass.private.coffee/api/interpreter', 45000],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds until the main server has a free slot for us, from its status page text. */
export function slotWaitSeconds(status: string): number {
  const free = /(\d+) slots? available now/.exec(status);
  if (free && Number(free[1]) > 0) return 0;
  const next = /in (\d+) seconds/.exec(status);
  return next ? Number(next[1]) + 1 : 5;
}

async function waitForSlot(): Promise<void> {
  try {
    const res = await fetch(STATUS);
    await sleep(Math.min(slotWaitSeconds(await res.text()), 30) * 1000);
  } catch {
    await sleep(3000);
  }
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export type Tab = 'eat' | 'see' | 'transit';

export function buildQuery(lat: number, lon: number, mode: TravelMode): string {
  const r = RADIUS[mode];
  const at = (radius: number) => `(around:${radius},${lat},${lon})`;
  const food = '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|biergarten|ice_cream|food_court)$"]["name"]';
  const tourism = '["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"]';
  const historic =
    '["historic"~"^(castle|monument|ruins|archaeological_site|fort|palace|city_gate|memorial|church|monastery|manor)$"]["name"]["wikidata"]';
  const parks = '["leisure"~"^(park|garden|nature_reserve)$"]["name"]["wikidata"]';
  const worship = '["amenity"="place_of_worship"]["name"]["wikidata"]';
  const lines = [
    `nwr${at(r.eat)}${food};`,
    `nwr${at(r.see)}${tourism};`,
    `nwr${at(r.see)}${historic};`,
    `nwr${at(r.see)}${parks};`,
    `nwr${at(r.see)}${worship};`,
    `nwr${at(r.station)}["railway"~"^(station|halt)$"]["name"];`,
    `nwr${at(r.station)}["amenity"~"^(bus_station|ferry_terminal)$"]["name"];`,
    `nwr${at(r.station)}["aerialway"="station"]["name"];`,
  ];
  if (r.eatNotable > r.eat) {
    lines.push(`nwr${at(r.eatNotable)}["amenity"~"^(restaurant|cafe|bar|pub)$"]["name"]["wikidata"];`);
  }
  if (r.seeNotable > r.see) {
    lines.push(`nwr${at(r.seeNotable)}${tourism}["wikidata"];`, `nwr${at(r.seeNotable)}${historic};`);
  }
  if (r.busStop > 0) {
    lines.push(
      `node${at(r.busStop)}["highway"="bus_stop"]["name"];`,
      `node${at(r.busStop)}["railway"="tram_stop"]["name"];`,
    );
  }
  return `[out:json][timeout:40];\n(\n  ${lines.join('\n  ')}\n);\nout center tags qt 2500;`;
}

export async function queryOverpass(query: string, signal?: AbortSignal): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const [i, [url, timeoutMs]] of ATTEMPTS.entries()) {
    if (i > 0 && url === MAIN) await waitForSlot();
    signal?.throwIfAborted();
    try {
      const res = await fetchJson<{ elements: OsmElement[] }>(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal,
        },
        timeoutMs,
      );
      return res.elements;
    } catch (err) {
      lastError = err;
      // A 400 means our query is wrong, and a cancel means nobody wants the answer; stop either way.
      if ((err instanceof HttpError && err.status === 400) || signal?.aborted) throw err;
    }
  }
  throw new Error(`OpenStreetMap servers are busy (${(lastError as Error)?.message ?? 'no response'})`);
}

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function cuisineLabel(cuisine?: string): string | undefined {
  if (!cuisine) return undefined;
  return cuisine
    .split(';')
    .slice(0, 2)
    .map((c) => titleCase(c.trim()))
    .join(', ');
}

interface Kind {
  tab: Tab;
  group: string;
  category: string;
  /** Transit ordering: lower shows first. */
  rank?: number;
}

export function classify(tags: Record<string, string>): Kind | undefined {
  const { amenity, tourism, historic, leisure, railway, station, highway, aerialway } = tags;
  const cuisine = cuisineLabel(tags.cuisine);
  const withCuisine = (label: string) => (cuisine ? `${label} · ${cuisine}` : label);
  switch (amenity) {
    case 'restaurant': return { tab: 'eat', group: 'restaurant', category: withCuisine('Restaurant') };
    case 'food_court': return { tab: 'eat', group: 'restaurant', category: 'Food court' };
    case 'cafe': return { tab: 'eat', group: 'cafe', category: withCuisine('Café') };
    case 'ice_cream': return { tab: 'eat', group: 'cafe', category: 'Ice cream' };
    case 'fast_food': return { tab: 'eat', group: 'fast_food', category: withCuisine('Fast food') };
    case 'bar': return { tab: 'eat', group: 'drinks', category: 'Bar' };
    case 'pub': return { tab: 'eat', group: 'drinks', category: 'Pub' };
    case 'biergarten': return { tab: 'eat', group: 'drinks', category: 'Beer garden' };
    case 'bus_station': return { tab: 'transit', group: 'bus', category: 'Bus station', rank: 2 };
    case 'ferry_terminal': return { tab: 'transit', group: 'ferry', category: 'Ferry terminal', rank: 2 };
    case 'place_of_worship': return { tab: 'see', group: 'sight', category: 'Place of worship' };
  }
  if (railway === 'station' || railway === 'halt') {
    if (station === 'subway') return { tab: 'transit', group: 'rail', category: 'Subway / metro station', rank: 0 };
    if (station === 'light_rail') return { tab: 'transit', group: 'rail', category: 'Light rail station', rank: 0 };
    if (station === 'monorail') return { tab: 'transit', group: 'rail', category: 'Monorail station', rank: 0 };
    return { tab: 'transit', group: 'rail', category: 'Train station', rank: 0 };
  }
  if (railway === 'tram_stop') return { tab: 'transit', group: 'tram', category: 'Tram stop', rank: 3 };
  if (highway === 'bus_stop') return { tab: 'transit', group: 'bus', category: 'Bus stop', rank: 4 };
  if (aerialway === 'station') return { tab: 'transit', group: 'rail', category: 'Cable car / gondola', rank: 1 };
  switch (tourism) {
    case 'museum': return { tab: 'see', group: 'museum', category: 'Museum' };
    case 'gallery': return { tab: 'see', group: 'museum', category: 'Art gallery' };
    case 'viewpoint': return { tab: 'see', group: 'sight', category: 'Viewpoint' };
    case 'zoo': return { tab: 'see', group: 'family', category: 'Zoo' };
    case 'aquarium': return { tab: 'see', group: 'family', category: 'Aquarium' };
    case 'theme_park': return { tab: 'see', group: 'family', category: 'Theme park' };
    case 'attraction': return { tab: 'see', group: 'sight', category: 'Attraction' };
  }
  if (historic) return { tab: 'see', group: 'sight', category: historic === 'memorial' ? 'Memorial' : titleCase(historic) };
  if (leisure) return { tab: 'see', group: 'park', category: titleCase(leisure) };
  return undefined;
}

function feeLabel(tags: Record<string, string>): string | undefined {
  if (tags.charge) return tags.charge;
  if (tags.fee === 'no') return 'Free';
  if (tags.fee === 'yes') return 'Admission fee';
  return undefined;
}

function extras(tags: Record<string, string>): string[] {
  const out: string[] = [];
  if (tags.route_ref) out.push(`Routes: ${tags.route_ref.replace(/;/g, ', ')}`);
  if (tags.network) out.push(`Network: ${tags.network}`);
  if (tags.operator && tags.operator !== tags.network) out.push(`Operator: ${tags.operator}`);
  if (/^(yes|only)$/.test(tags['diet:vegetarian'] ?? '')) out.push('Vegetarian options');
  if (/^(yes|only)$/.test(tags['diet:vegan'] ?? '')) out.push('Vegan options');
  if (tags.outdoor_seating === 'yes') out.push('Outdoor seating');
  if (tags.takeaway === 'yes' || tags.takeaway === 'only') out.push('Takeout');
  if (tags.wheelchair === 'yes') out.push('Wheelchair accessible');
  if (tags.internet_access === 'wlan' || tags.internet_access === 'yes') out.push('Wi-Fi');
  return out;
}

/** OSM websites are hand-typed: "www.x.com" needs a scheme, and anything not http(s) is dropped. */
export function normalizeUrl(value?: string): string | undefined {
  const v = value?.split(';')[0].trim();
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(v)) return `https://${v}`;
  return undefined;
}

export interface OsmListing extends Listing {
  tab: Tab;
  wikidata?: string;
  rank?: number;
}

export function elementToListing(el: OsmElement): OsmListing | undefined {
  const tags = el.tags ?? {};
  const name = tags['name:en'] || tags.name;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!name || lat === undefined || lon === undefined) return undefined;
  const kind = classify(tags);
  if (!kind) return undefined;
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const address = [street, tags['addr:city']].filter(Boolean).join(', ');
  const wikipediaTag = tags.wikipedia;
  const wikipedia = wikipediaTag?.includes(':')
    ? (() => {
        const [lang, ...rest] = wikipediaTag.split(':');
        return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(rest.join(':').replace(/ /g, '_'))}`;
      })()
    : undefined;
  const local = tags.name && tags.name !== name ? tags.name : undefined;
  const description = [local && `Local name: ${local}.`, tags.description].filter(Boolean).join(' ');
  return {
    id: `osm:${el.type}/${el.id}`,
    tab: kind.tab,
    rank: kind.rank,
    name,
    category: kind.category,
    group: kind.group,
    source: 'osm',
    lat,
    lon,
    description: description || undefined,
    hours: tags.opening_hours ? formatOsmHours(tags.opening_hours).join('\n') : undefined,
    price: feeLabel(tags),
    address: address || undefined,
    // Both tags may hold several values separated by ";"; keep the first.
    phone: (tags.phone || tags['contact:phone'])?.split(';')[0].trim() || undefined,
    website: normalizeUrl(tags.website || tags['contact:website'] || tags.url),
    wikipedia,
    wikipediaTag,
    wikidata: tags.wikidata,
    extra: extras(tags),
  };
}
