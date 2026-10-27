import type { About, Place } from '../types';
import { WIKIMEDIA_HEADERS, fetchJson, qs } from '../lib/http';
import { extractGetAround, extractListings, type ParsedListing } from './wikitext';
import type { TextSection } from '../types';

// Wikivoyage: free, community-written travel guide. Its listings carry hours and prices.
const API = 'https://en.wikivoyage.org/w/api.php';

interface GeoSearchResponse {
  query?: { geosearch: { title: string; dist: number }[] };
}

interface PagesResponse {
  query?: {
    pages: {
      title: string;
      missing?: boolean;
      fullurl?: string;
      extract?: string;
      thumbnail?: { source: string };
      revisions?: { slots: { main: { content: string } } }[];
    }[];
  };
}

export interface WikivoyageResult {
  listings: ParsedListing[];
  getAround: TextSection[];
  getAroundSource?: string;
  about?: About;
}

async function nearbyArticles(place: Place): Promise<string[]> {
  const url = `${API}?${qs({
    action: 'query', list: 'geosearch', gscoord: `${place.lat}|${place.lon}`, gsradius: 10000, gslimit: 6,
    gsnamespace: 0, format: 'json', formatversion: 2, origin: '*',
  })}`;
  const res = await fetchJson<GeoSearchResponse>(url, { headers: WIKIMEDIA_HEADERS });
  return (res.query?.geosearch ?? []).map((g) => g.title);
}

/**
 * Picks which articles to read: the 3 nearest, plus the parent city of any district
 * article ("Paris/Le Marais" → "Paris"), plus the place's own name as a fallback.
 */
export function chooseArticles(nearby: string[], placeName: string): string[] {
  const titles = new Set<string>();
  for (const t of nearby.slice(0, 3)) {
    titles.add(t);
    if (t.includes('/')) titles.add(t.split('/')[0]);
  }
  if (titles.size === 0) titles.add(placeName);
  return [...titles].slice(0, 5);
}

/** The article to use for the About tab: the place's own article, else a city-level one. */
export function pickAboutTitle(titles: string[], placeName: string): string | undefined {
  const lower = placeName.toLowerCase();
  return (
    titles.find((t) => t.toLowerCase() === lower) ?? titles.find((t) => !t.includes('/')) ?? titles[0]
  );
}

export async function fetchWikivoyage(place: Place): Promise<WikivoyageResult> {
  const titles = chooseArticles(await nearbyArticles(place), place.name);
  const url = `${API}?${qs({
    action: 'query', titles: titles.join('|'), redirects: 1, prop: 'revisions|extracts|pageimages|info',
    rvprop: 'content', rvslots: 'main', exintro: 1, explaintext: 1, exlimit: 20, piprop: 'thumbnail',
    pithumbsize: 1000, inprop: 'url', format: 'json', formatversion: 2, origin: '*',
  })}`;
  const res = await fetchJson<PagesResponse>(url, { headers: WIKIMEDIA_HEADERS });
  const pages = (res.query?.pages ?? []).filter((p) => !p.missing && p.revisions?.length);

  const listings: ParsedListing[] = [];
  let getAround: TextSection[] = [];
  let getAroundSource: string | undefined;
  // City-level pages first so their "Get around" wins over a district's.
  const ordered = [...pages].sort((a, b) => Number(a.title.includes('/')) - Number(b.title.includes('/')));
  for (const page of ordered) {
    const text = page.revisions![0].slots.main.content;
    if (/^#REDIRECT/i.test(text) || /\{\{\s*disamb/i.test(text)) continue;
    listings.push(...extractListings(text, page.title));
    if (!getAround.length) {
      getAround = extractGetAround(text);
      if (getAround.length) getAroundSource = page.fullurl;
    }
  }

  const aboutTitle = pickAboutTitle(ordered.map((p) => p.title), place.name);
  const aboutPage = ordered.find((p) => p.title === aboutTitle);
  const about: About | undefined =
    aboutPage?.extract && aboutPage.fullurl
      ? { title: aboutPage.title, extract: aboutPage.extract, url: aboutPage.fullurl, image: aboutPage.thumbnail?.source }
      : undefined;

  return { listings, getAround, getAroundSource, about };
}
