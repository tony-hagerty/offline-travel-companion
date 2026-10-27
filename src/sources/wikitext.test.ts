import { describe, expect, it } from 'vitest';
import { cleanWikitext, extractGetAround, extractListings, findTemplates, parseTemplate, priceTierFrom } from './wikitext';

const PAGE = `{{pagebanner|Paris banner.jpg}}
Paris is the capital of France.

==Get around==
The metro is the fastest way. A single ticket costs '''€2.15''' ([[Île-de-France Mobilités|IDFM]]).

===By bus===
* Buses run until 00:30.
* Night buses ({{marker|type=go|name=Noctilien|lat=48.8|long=2.3}}) cover the rest.

{{go|name=Gare du Nord|lat=48.8809|long=2.3553|content=Main rail station.}}

==See==
* {{see
| name=Louvre | alt=Musée du Louvre | url=https://www.louvre.fr | lat=48.8611 | long=2.3364
| hours=W-M 09:00-18:00<br>Closed Tu | price=€22 | image=Louvre Museum Wikimedia Commons.jpg
| wikipedia=Louvre | content=The world's largest art museum, home to the {{w|Mona Lisa}}.
}}

==Eat==
===Budget===
* {{eat | name=Chez Gladines | address=30 Rue des Cinq Diamants | price=Mains €10-14 | hours=Daily noon-midnight | content=Basque food, ''huge'' salads.<ref>Visited 2024</ref> }}
===Mid-range===
* {{listing|type=eat|name=Le Comptoir|lat=|long=|price=€30}}
===Splurge===
* {{eat|name=|content=no name, should be skipped}}

==Drink==
* {{drink|name=Café de Flore {{rint|paris|4}}|phone=+33 1 45 48 55 26}}
`;

describe('findTemplates / parseTemplate', () => {
  it('finds top-level templates with nesting intact', () => {
    const text = 'a {{x|{{y|1}}|k=v}} b {{z}}';
    const spans = findTemplates(text);
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(['{{x|{{y|1}}|k=v}}', '{{z}}']);
  });

  it('splits params outside nested templates and links', () => {
    const t = parseTemplate('{{Eat|name=[[A|B]]|url=https://x.com/?a=b|{{w|c|d}}}}');
    expect(t.name).toBe('eat');
    expect(t.params.name).toBe('[[A|B]]');
    expect(t.params.url).toBe('https://x.com/?a=b');
    expect(t.positional).toEqual(['{{w|c|d}}']);
  });
});

describe('cleanWikitext', () => {
  it('removes markup and keeps visible text', () => {
    expect(cleanWikitext("'''Bold''' [[Target|shown]] and [[Plain]] [https://x.com site] &amp; more<ref>x</ref>")).toBe(
      'Bold shown and Plain site & more',
    );
  });

  it('drops files and layout templates, keeps inline template text', () => {
    expect(cleanWikitext('[[File:A.jpg|thumb|caption [[link]]]]Text {{pagebanner|x}} {{rint|paris|1}}')).toBe('Text 1');
  });

  it('replaces markers with their name', () => {
    expect(cleanWikitext('Take {{marker|type=go|name=Gare de Lyon|lat=1|long=2}} south.')).toBe('Take Gare de Lyon south.');
  });
});

describe('extractListings', () => {
  const listings = extractListings(PAGE, 'Paris');
  const byName = Object.fromEntries(listings.map((l) => [l.name, l]));

  it('extracts named listings and skips nameless ones', () => {
    expect(listings.map((l) => l.name)).toEqual(['Gare du Nord', 'Louvre', 'Chez Gladines', 'Le Comptoir', 'Café de Flore']);
  });

  it('reads coordinates, hours, price, website, and image', () => {
    const louvre = byName['Louvre'];
    expect(louvre.kind).toBe('see');
    expect(louvre.lat).toBeCloseTo(48.8611);
    expect(louvre.lon).toBeCloseTo(2.3364);
    expect(louvre.hours).toBe('W-M 09:00-18:00 Closed Tu');
    expect(louvre.price).toBe('€22');
    expect(louvre.website).toBe('https://www.louvre.fr');
    expect(louvre.commonsFile).toBe('Louvre Museum Wikimedia Commons.jpg');
    expect(louvre.wikipediaTag).toBe('en:Louvre');
    expect(louvre.description).toBe("Also known as Musée du Louvre. The world's largest art museum, home to the Mona Lisa.");
    expect(louvre.guidePick).toBe(true);
  });

  it('assigns price tiers from Eat subheadings', () => {
    expect(byName['Chez Gladines'].priceTier).toBe(1);
    expect(byName['Chez Gladines'].category).toBe('Restaurant · Budget');
    expect(byName['Chez Gladines'].description).toBe('Basque food, huge salads.');
    expect(byName['Le Comptoir'].priceTier).toBe(2);
    expect(byName['Le Comptoir'].kind).toBe('eat');
    expect(byName['Le Comptoir'].lat).toBeUndefined();
  });

  it('classifies drink and go listings', () => {
    expect(byName['Café de Flore'].kind).toBe('drink');
    expect(byName['Café de Flore'].phone).toBe('+33 1 45 48 55 26');
    expect(byName['Gare du Nord'].kind).toBe('go');
  });
});

describe('extractGetAround', () => {
  it('returns headed paragraphs without listing templates', () => {
    expect(extractGetAround(PAGE)).toEqual([
      { heading: undefined, paragraphs: ['The metro is the fastest way. A single ticket costs €2.15 (IDFM).'] },
      { heading: 'By bus', paragraphs: ['• Buses run until 00:30.', '• Night buses (Noctilien) cover the rest.'] },
    ]);
  });
});

describe('priceTierFrom', () => {
  it.each([
    ['Budget', 1],
    ['Mid-range', 2],
    ['Splurge', 3],
    ['Fine dining', 3],
    ['Vegetarian', undefined],
  ])('%s → %s', (heading, tier) => expect(priceTierFrom(heading)).toBe(tier));
});
