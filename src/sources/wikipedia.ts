import type { About, Listing } from '../types';
import { WIKIMEDIA_HEADERS, chunk, fetchJson, qs } from '../lib/http';

// Wikipedia/Wikidata/Commons: photos, short descriptions, and page views (our "popularity" signal).

interface WikidataResponse {
  entities: Record<string, { sitelinks?: { enwiki?: { title: string } } }>;
}

/** Maps Wikidata IDs (Q123) to English Wikipedia titles, where one exists. */
async function englishTitles(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const batch of chunk(ids, 50)) {
    const url = `https://www.wikidata.org/w/api.php?${qs({
      action: 'wbgetentities', ids: batch.join('|'), props: 'sitelinks', sitefilter: 'enwiki', format: 'json', origin: '*',
    })}`;
    const res = await fetchJson<WikidataResponse>(url, { headers: WIKIMEDIA_HEADERS });
    for (const [id, entity] of Object.entries(res.entities ?? {})) {
      const title = entity.sitelinks?.enwiki?.title;
      if (title) out.set(id, title);
    }
  }
  return out;
}

interface WikiPagesResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages: {
      title: string;
      missing?: boolean;
      extract?: string;
      fullurl?: string;
      thumbnail?: { source: string };
      pageviews?: Record<string, number | null>;
    }[];
  };
}

interface WikiInfo {
  extract?: string;
  url?: string;
  image?: string;
  views: number;
}

/** Fetches description, photo, and 30-day views for titles on one language's Wikipedia. */
async function pageInfo(lang: string, titles: string[]): Promise<Map<string, WikiInfo>> {
  const out = new Map<string, WikiInfo>();
  // TextExtracts returns at most 20 extracts per request.
  for (const batch of chunk(titles, 20)) {
    const url = `https://${lang}.wikipedia.org/w/api.php?${qs({
      action: 'query', titles: batch.join('|'), redirects: 1, prop: 'pageimages|extracts|pageviews|info',
      piprop: 'thumbnail', pithumbsize: 640, exintro: 1, explaintext: 1, exsentences: 3, exlimit: 20,
      pvipdays: 30, inprop: 'url', format: 'json', formatversion: 2, origin: '*',
    })}`;
    const res = await fetchJson<WikiPagesResponse>(url, { headers: WIKIMEDIA_HEADERS });
    const q = res.query;
    if (!q) continue;
    // Follow the requested title through normalization and redirects to the final page.
    const alias = new Map<string, string>();
    for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) alias.set(n.from, n.to);
    const resolve = (t: string) => {
      let cur = t;
      for (let i = 0; i < 3 && alias.has(cur); i++) cur = alias.get(cur)!;
      return cur;
    };
    const byTitle = new Map(q.pages.filter((p) => !p.missing).map((p) => [p.title, p]));
    for (const requested of batch) {
      const page = byTitle.get(resolve(requested));
      if (!page) continue;
      const views = Object.values(page.pageviews ?? {}).reduce<number>((sum, v) => sum + (v ?? 0), 0);
      out.set(requested, { extract: page.extract || undefined, url: page.fullurl, image: page.thumbnail?.source, views });
    }
  }
  return out;
}

type Enrichable = Listing & { wikidata?: string };

/**
 * Adds Wikipedia photos, descriptions, and view counts to listings that link to Wikipedia.
 * Prefers the English article (via Wikidata) over the local-language one.
 */
export async function enrichFromWikipedia(listings: Enrichable[]): Promise<void> {
  const linked = listings.filter((l) => l.wikidata || l.wikipediaTag);
  if (!linked.length) return;

  const qids = [...new Set(linked.map((l) => l.wikidata).filter((q): q is string => !!q && /^Q\d+$/.test(q)))];
  const enTitles = await englishTitles(qids).catch(() => new Map<string, string>());

  const wanted = new Map<string, Set<string>>(); // lang → titles
  const target = new Map<Enrichable, [string, string]>();
  for (const l of linked) {
    let lang: string | undefined;
    let title: string | undefined;
    const en = l.wikidata && enTitles.get(l.wikidata);
    if (en) {
      [lang, title] = ['en', en];
    } else if (l.wikipediaTag?.includes(':')) {
      const [tagLang, ...rest] = l.wikipediaTag.split(':');
      [lang, title] = [tagLang, rest.join(':')];
    }
    if (!lang || !title || !/^[a-z-]{2,12}$/.test(lang)) continue;
    if (!wanted.has(lang)) wanted.set(lang, new Set());
    wanted.get(lang)!.add(title);
    target.set(l, [lang, title]);
  }

  const results = new Map<string, Map<string, WikiInfo>>();
  await Promise.all(
    [...wanted].map(async ([lang, titles]) => {
      results.set(lang, await pageInfo(lang, [...titles]).catch(() => new Map()));
    }),
  );

  for (const [l, [lang, title]] of target) {
    const info = results.get(lang)?.get(title);
    if (!info) continue;
    l.views = info.views;
    l.image ??= info.image;
    if (info.url) l.wikipedia = info.url;
    if (info.extract && (!l.description || l.description.length < 60)) {
      l.description = l.description ? `${l.description} ${info.extract}` : info.extract;
    }
  }
}

interface CommonsResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    pages: { title: string; imageinfo?: { thumburl?: string; url: string }[] }[];
  };
}

/** Converts Commons file names (from Wikivoyage listings) into image URLs. */
export async function resolveCommonsImages(listings: Listing[]): Promise<void> {
  const files = [...new Set(listings.filter((l) => l.commonsFile && !l.image).map((l) => `File:${l.commonsFile}`))];
  const urls = new Map<string, string>();
  for (const batch of chunk(files, 50)) {
    const url = `https://commons.wikimedia.org/w/api.php?${qs({
      action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url', iiurlwidth: 640,
      format: 'json', formatversion: 2, origin: '*',
    })}`;
    const res = await fetchJson<CommonsResponse>(url, { headers: WIKIMEDIA_HEADERS });
    const alias = new Map((res.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of res.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (info) urls.set(alias.get(page.title) ?? page.title, info.thumburl ?? info.url);
    }
  }
  for (const l of listings) {
    if (l.commonsFile && !l.image) l.image = urls.get(`File:${l.commonsFile}`);
  }
}

/**
 * The lead photo of a place's English Wikipedia article. Wikivoyage's page image is often a
 * map or a thin banner, so this makes a better header photo.
 */
export async function wikipediaLeadImage(title: string): Promise<string | undefined> {
  const url = `https://en.wikipedia.org/w/api.php?${qs({
    action: 'query', titles: title, redirects: 1, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: 1000,
    format: 'json', formatversion: 2, origin: '*',
  })}`;
  const res = await fetchJson<WikiPagesResponse>(url, { headers: WIKIMEDIA_HEADERS });
  return res.query?.pages[0]?.thumbnail?.source;
}

interface SummaryResponse {
  title: string;
  extract: string;
  thumbnail?: { source: string };
  originalimage?: { source: string };
  content_urls?: { mobile?: { page: string }; desktop?: { page: string } };
}

/** Wikipedia's summary of a place, used for About when Wikivoyage has nothing. */
export async function wikipediaSummary(title: string): Promise<About | undefined> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const res = await fetchJson<SummaryResponse>(url, { headers: WIKIMEDIA_HEADERS });
  if (!res.extract) return undefined;
  return {
    title: res.title,
    extract: res.extract,
    url: res.content_urls?.mobile?.page ?? res.content_urls?.desktop?.page ?? '',
    image: res.thumbnail?.source,
  };
}
