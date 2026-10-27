import type { EventTiming, Listing, TextSection } from '../types';
import { describeTiming, hasClockTime, monthPart, monthsMentioned, weekdaysMentioned } from '../lib/events';

// A small parser for the parts of Wikivoyage wikitext we use: section headings,
// listing templates like {{eat|name=...|price=...}}, and plain prose.

export interface Template {
  name: string;
  params: Record<string, string>;
  positional: string[];
}

interface Span {
  start: number;
  end: number;
}

/** Top-level {{...}} spans, with nested templates kept inside their parent. */
export function findTemplates(text: string): Span[] {
  const spans: Span[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      if (depth === 0) start = i;
      depth++;
      i++;
    } else if (text[i] === '}' && text[i + 1] === '}' && depth > 0) {
      depth--;
      i++;
      if (depth === 0) spans.push({ start, end: i + 1 });
    }
  }
  return spans;
}

/** Splits on `sep` only where it isn't inside {{ }} or [[ ]]. */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      i++;
    } else if ((two === '}}' || two === ']]') && depth > 0) {
      depth--;
      i++;
    } else if (depth === 0 && s[i] === sep) {
      out.push(s.slice(last, i));
      last = i + 1;
    }
  }
  out.push(s.slice(last));
  return out;
}

/** Parses "{{name|a|key=value}}" into its name, named params, and positional params. */
export function parseTemplate(raw: string): Template {
  const inner = raw.slice(2, -2);
  const [head, ...parts] = splitTopLevel(inner, '|');
  const params: Record<string, string> = {};
  const positional: string[] = [];
  for (const part of parts) {
    const eq = splitTopLevel(part, '=');
    if (eq.length > 1 && /^\s*[\w -]+\s*$/.test(eq[0])) {
      params[eq[0].trim().toLowerCase()] = eq.slice(1).join('=').trim();
    } else {
      positional.push(part.trim());
    }
  }
  return { name: head.trim().toLowerCase().replace(/_/g, ' '), params, positional };
}

const DROP_TEMPLATES = new Set([
  'pagebanner', 'mapframe', 'mapmask', 'mapshape', 'mapshapes', 'geo', 'ispartof', 'seealso', 'see also',
  'quickbar', 'regionlist', 'routebox', 'usablecity', 'guidecity', 'outlinecity', 'starcity', 'usabledistrict',
  'guidedistrict', 'outlinedistrict', 'stardistrict', 'disamb', 'printdistricts', 'related', 'commons', 'clear',
  'ipa', 'wikipedia', 'dmoz', 'climate', 'weather', 'ref', 'reflist', 'tocright', 'toc', 'rail-interline', 'boxtop',
  'boxbottom', 'go', 'see', 'do', 'eat', 'drink', 'buy', 'sleep', 'listing',
]);

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', euro: '€', pound: '£', yen: '¥',
  hellip: '…', times: '×', deg: '°', middot: '·',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function replaceTemplates(s: string, fn: (t: Template) => string): string {
  const spans = findTemplates(s);
  if (!spans.length) return s;
  let out = '';
  let last = 0;
  for (const { start, end } of spans) {
    out += s.slice(last, start) + fn(parseTemplate(s.slice(start, end)));
    last = end;
  }
  return out + s.slice(last);
}

/** Converts a wikitext fragment to plain text. */
export function cleanWikitext(s: string, keepNewlines = false): string {
  let t = s.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = replaceTemplates(t, (tpl) => {
    if (tpl.name === 'marker') return tpl.params.name ?? '';
    if (DROP_TEMPLATES.has(tpl.name)) return '';
    // Inline helpers like {{rint|paris|1}} or {{station|X}}: their last argument is usually the visible text.
    const last = tpl.positional[tpl.positional.length - 1] ?? '';
    return last.length <= 80 ? cleanWikitext(last) : '';
  });
  // Files/images, with possibly nested links in their captions.
  t = t.replace(/\[\[(?:File|Image):(?:[^[\]]|\[\[[^\]]*\]\])*\]\]/gi, '');
  t = t.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');
  t = t.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[(?:https?:)?\/\/\S+\]/g, '');
  t = t.replace(/'''''|'''|''/g, '');
  t = t.replace(/<br\s*\/?>/gi, keepNewlines ? '\n' : ' ');
  t = t.replace(/<\/?[a-z][^>]*>/gi, '');
  t = decodeEntities(t);
  if (keepNewlines) return t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  return t.replace(/\s+/g, ' ').trim();
}

export interface WikiSection {
  /** Level-2 heading, lowercased (e.g. "eat"). Empty for the lead. */
  main: string;
  /** Deeper heading, if any (e.g. "Budget"). */
  sub?: string;
  body: string;
}

/** Splits wikitext into sections at == headings ==. */
export function splitSections(wikitext: string): WikiSection[] {
  const sections: WikiSection[] = [];
  let main = '';
  let sub: string | undefined;
  let body: string[] = [];
  const flush = () => {
    if (body.length) sections.push({ main, sub, body: body.join('\n') });
    body = [];
  };
  for (const line of wikitext.split('\n')) {
    const h = /^(={2,6})\s*(.+?)\s*\1\s*$/.exec(line);
    if (h) {
      flush();
      const heading = cleanWikitext(h[2]);
      if (h[1].length === 2) {
        main = heading.toLowerCase();
        sub = undefined;
      } else {
        sub = heading;
      }
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

export function priceTierFrom(heading?: string): 1 | 2 | 3 | undefined {
  if (!heading) return undefined;
  if (/budget|cheap|inexpensive/i.test(heading)) return 1;
  if (/mid|moderate/i.test(heading)) return 2;
  if (/splurge|expensive|upscale|fine dining|luxury|high[- ]end/i.test(heading)) return 3;
  return undefined;
}

const KIND_BY_TEMPLATE: Record<string, string> = {
  see: 'see', do: 'do', eat: 'eat', drink: 'drink', go: 'go', buy: 'buy', sleep: 'sleep',
};

const KIND_BY_SECTION: Record<string, string> = {
  see: 'see', do: 'do', eat: 'eat', drink: 'drink', 'get around': 'go', 'get in': 'go', buy: 'buy', sleep: 'sleep',
};

const KIND_LABEL: Record<string, { category: string; group: string }> = {
  see: { category: 'Sight', group: 'sight' },
  do: { category: 'Activity', group: 'activity' },
  eat: { category: 'Restaurant', group: 'restaurant' },
  drink: { category: 'Bar / café', group: 'drinks' },
  go: { category: 'Transport', group: 'transport' },
  buy: { category: 'Shop', group: 'shop' },
  sleep: { category: 'Lodging', group: 'lodging' },
};

export interface ParsedListing extends Listing {
  /** Which Wikivoyage list it came from: see, do, eat, drink, go, buy, sleep. */
  kind: string;
}

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && s.trim() !== '' ? n : undefined;
}

/** Extracts every listing template ({{see}}, {{eat}}, {{listing|type=...}}, ...) from a page. */
export function extractListings(wikitext: string, pageTitle: string): ParsedListing[] {
  const out: ParsedListing[] = [];
  for (const section of splitSections(wikitext)) {
    for (const span of findTemplates(section.body)) {
      const tpl = parseTemplate(section.body.slice(span.start, span.end));
      const isListing = tpl.name in KIND_BY_TEMPLATE || tpl.name === 'listing';
      if (!isListing) continue;
      const p = tpl.params;
      // Names sometimes carry route icons like {{rint|lisbon|28}}; drop those.
      const name = cleanWikitext(replaceTemplates(p.name ?? '', () => ''));
      if (!name) continue;
      const kind =
        KIND_BY_TEMPLATE[tpl.name] ?? KIND_BY_TEMPLATE[(p.type ?? '').toLowerCase()] ?? KIND_BY_SECTION[section.main] ?? 'see';
      const tier = kind === 'eat' || kind === 'drink' ? priceTierFrom(section.sub) : undefined;
      const label = KIND_LABEL[kind];
      const address = [p.address, p.directions].map((v) => cleanWikitext(v ?? '')).filter(Boolean).join(' — ');
      const alt = cleanWikitext(p.alt ?? '');
      const description = [alt && `Also known as ${alt}.`, cleanWikitext(p.content ?? p.description ?? '')]
        .filter(Boolean)
        .join(' ');
      const wikipedia = cleanWikitext(p.wikipedia ?? '');
      const hours = cleanWikitext(p.hours ?? '');
      const event = detectEvent(kind, hours, description, isEventSection(section));
      out.push({
        id: `wv:${pageTitle}:${name}`,
        kind,
        name,
        category: event
          ? eventCategory(name, section, description)
          : tier
            ? `${label.category} · ${['Budget', 'Mid-range', 'Splurge'][tier - 1]}`
            : label.category,
        group: event ? 'event' : label.group,
        event,
        source: 'wikivoyage',
        guidePick: true,
        lat: num(p.lat),
        lon: num(p.long ?? p.lon),
        description: description || undefined,
        hours: hours || undefined,
        price: cleanWikitext(p.price ?? '') || undefined,
        priceTier: tier,
        address: address || undefined,
        phone: cleanWikitext(p.phone ?? p.tollfree ?? '') || undefined,
        website: /^https?:\/\//.test(p.url ?? '') ? p.url!.trim() : undefined,
        wikipedia: wikipedia ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipedia.replace(/ /g, '_'))}` : undefined,
        wikipediaTag: wikipedia ? `en:${wikipedia}` : undefined,
        commonsFile: cleanWikitext(p.image ?? '').replace(/^(File|Image):/i, '') || undefined,
      });
    }
    if (isEventSection(section)) out.push(...proseEvents(section, pageTitle));
  }
  return out;
}

const EVENT_HEADING = /event|festival|celebrat|carnival|holiday|fiesta|\bfairs?\b/i;

function isEventSection(section: WikiSection): boolean {
  return EVENT_HEADING.test(section.sub ?? '') || EVENT_HEADING.test(section.main);
}

function eventCategory(name: string, section: WikiSection, description = ''): string {
  return /festival|fest\b|carnival|fiesta/i.test(`${name} ${section.sub ?? ''} ${description}`) ? 'Festival' : 'Event';
}

/**
 * Timing for festivals and recurring events. Anything in an events section counts. Elsewhere,
 * only activities whose hours read like a date ("April", "every Tue") rather than opening
 * hours ("Apr–Oct 09:00–18:00"), which would otherwise turn seasonal attractions into events.
 */
export function detectEvent(kind: string, hours: string, description: string, inEventSection: boolean): EventTiming | undefined {
  if (!inEventSection && (kind !== 'do' || hasClockTime(hours))) return undefined;
  const text = inEventSection ? `${hours} ${description}` : hours;
  const months = monthsMentioned(text);
  const weekdays = weekdaysMentioned(text);
  if (!inEventSection && !months.length && !weekdays.length) return undefined;
  return { when: hours || describeTiming({ months, weekdays }), months, weekdays, part: monthPart(text) };
}

/** Events written as plain bullets ("* '''Carnival''' (Feb/Mar): parades…") in an events section. */
function proseEvents(section: WikiSection, pageTitle: string): ParsedListing[] {
  const out: ParsedListing[] = [];
  for (const line of section.body.split('\n')) {
    if (!/^[*#]/.test(line) || /\{\{\s*(see|do|eat|drink|buy|sleep|go|listing)\b/i.test(line)) continue;
    const named = /'''(.+?)'''/.exec(line) ?? /^[*#:\s]*\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/.exec(line);
    const name = named && cleanWikitext(named[1]);
    if (!name || name.length > 80) continue;
    const text = cleanWikitext(line.replace(/^[*#:\s]+/, ''));
    const description = text.startsWith(name) ? text.slice(name.length).replace(/^[\s:,.–—-]+/, '') : text;
    const months = monthsMentioned(text);
    const weekdays = weekdaysMentioned(text);
    out.push({
      id: `wv:${pageTitle}:${name}`,
      kind: 'do',
      name,
      category: eventCategory(name, section, description),
      group: 'event',
      source: 'wikivoyage',
      guidePick: true,
      description: description || undefined,
      event: { when: describeTiming({ months, weekdays }), months, weekdays, part: monthPart(text) },
    });
  }
  return out;
}

/** The "Get around" section as headed paragraphs, with listing templates removed. */
export function extractGetAround(wikitext: string): TextSection[] {
  const out: TextSection[] = [];
  for (const section of splitSections(wikitext)) {
    if (section.main !== 'get around') continue;
    const text = cleanWikitext(section.body, true);
    const paragraphs: string[] = [];
    let para: string[] = [];
    const flush = () => {
      if (para.length) paragraphs.push(para.join(' '));
      para = [];
    };
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) {
        flush();
      } else if (/^[*#:;]/.test(line)) {
        flush();
        const item = line.replace(/^[*#:;]+\s*/, '');
        if (item) paragraphs.push(`• ${item}`);
      } else {
        para.push(line);
      }
    }
    flush();
    if (paragraphs.length) out.push({ heading: section.sub, paragraphs });
  }
  return out;
}
