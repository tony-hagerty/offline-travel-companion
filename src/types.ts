export type TravelMode = 'walk' | 'car';

export type Section = 'eat' | 'see' | 'transit' | 'weather' | 'about';

export interface Place {
  lat: number;
  lon: number;
  /** Short name, e.g. "Paris". */
  name: string;
  /** Longer label, e.g. "Paris, Île-de-France, France". */
  label: string;
  countryCode?: string;
}

export interface Trip {
  /** "current" for the pinned current-location entry. */
  id: string;
  kind: 'current' | 'destination';
  place: Place;
  /** YYYY-MM-DD, in the destination's calendar. */
  startDate: string;
  endDate: string;
  /** The mode currently shown. */
  mode: TravelMode;
  createdAt: number;
  /** Saved results for each mode; switching modes shows the saved one without re-downloading. */
  guides?: Partial<Record<TravelMode, Guide>>;
}

export type ListingSource = 'wikivoyage' | 'osm';

export interface Listing {
  id: string;
  name: string;
  /** Human label such as "Restaurant · Italian" or "Museum". */
  category: string;
  /** Group used for filter chips, e.g. "restaurant", "cafe", "bar", "museum". */
  group: string;
  source: ListingSource;
  lat?: number;
  lon?: number;
  /** Meters from the trip center. */
  distance?: number;
  description?: string;
  hours?: string;
  price?: string;
  /** 1–3 from Wikivoyage's Budget / Mid-range / Splurge headings. */
  priceTier?: 1 | 2 | 3;
  address?: string;
  phone?: string;
  website?: string;
  wikipedia?: string;
  /** "lang:Title" form, as in OSM's wikipedia tag. */
  wikipediaTag?: string;
  image?: string;
  /** Commons file name awaiting conversion to an image URL. */
  commonsFile?: string;
  /** Wikipedia page views over the last 30 days. */
  views?: number;
  /** True when it came from a travel guide (curated). */
  guidePick?: boolean;
  /** Extra free-form details, e.g. route numbers or operator. */
  extra?: string[];
  score?: number;
  /** Set for festivals and recurring events. */
  event?: EventTiming;
}

export interface EventTiming {
  /** When it happens, as the guide wrote it (or a generated label). */
  when?: string;
  /** Months it happens in, 0–11. Empty when unknown. */
  months: number[];
  /** Weekdays for recurring events, 0 = Sunday. Empty when not weekly. */
  weekdays: number[];
  /** For a single month: which part of it ("late April"). */
  part?: 'early' | 'mid' | 'late';
}

export interface TextSection {
  heading?: string;
  paragraphs: string[];
}

export interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
  /** % chance (forecast) or null when using last year's data. */
  precipChance: number | null;
  /** mm of rain/snow (last year's data only). */
  precipSum: number | null;
  sunrise?: string;
  sunset?: string;
  uvMax?: number;
  windMax?: number;
  /** "forecast" for real forecasts, "lastYear" for the same date a year earlier. */
  kind: 'forecast' | 'lastYear';
}

export interface Weather {
  timezone?: string;
  current?: {
    temp: number;
    feelsLike: number;
    code: number;
    humidity: number;
    wind: number;
    time: string;
  };
  days: WeatherDay[];
}

export interface About {
  title: string;
  extract: string;
  url: string;
  image?: string;
}

export interface Guide {
  fetchedAt: number;
  /** True while OpenStreetMap results are still missing (first download in progress or interrupted). */
  partial?: boolean;
  /** Center and mode the guide was built for, to detect when it needs a rebuild. */
  builtFor: { lat: number; lon: number; mode: TravelMode };
  timezone?: string;
  about?: About;
  eat: Listing[];
  see: Listing[];
  transit: Listing[];
  /** Festivals and recurring events; whether they fall in the trip is worked out when shown. */
  events?: Listing[];
  getAround: TextSection[];
  getAroundSource?: string;
  weather?: Weather;
  weatherFetchedAt?: number;
  /** Per-section error messages from the last refresh. */
  errors: Partial<Record<Section, string>>;
}

export type Units = 'imperial' | 'metric';
