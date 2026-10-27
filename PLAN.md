# Travel Companion — Plan

A Progressive Web App (PWA): a website that installs to the phone's home screen
and works offline. One codebase for iPhone and Android, built on Windows, no App
Store or Apple fees.

## Decisions

| Area | Choice | Why |
|---|---|---|
| Platform | PWA (React + TypeScript + Vite) | Runs on iPhone and Android, installable, no Mac needed |
| Offline | Service worker caches the app and photos; trips live in IndexedDB | Trips open with no signal |
| Data | Free, no-key sources only | No billing account or API keys |
| Hosting | Free static host (Cloudflare Pages or GitHub Pages), HTTPS | Install and location access need HTTPS |

## Data sources

| Need | Source | Notes |
|---|---|---|
| Destination search, "where am I" | Photon (OpenStreetMap geocoder); Nominatim as backup | Search-as-you-type; when Photon is down, Enter searches Nominatim |
| Curated places with hours and prices | Wikivoyage listings (See / Do / Eat / Drink / Get around) | Travel-writer picks; Eat is split into Budget / Mid-range / Splurge |
| Festivals and recurring events | Wikivoyage (dated "Do" listings, events sections) | Matched to trip dates by month, part of month, and weekday |
| Nearby places, stations, stops (fast) | Photon nearby lookup; Nominatim as backup | Names, addresses, locations; Nominatim also has hours |
| Hours, cuisine, websites | OpenStreetMap via Overpass API | Slow and often overloaded; fills in details when it answers |
| Photos, descriptions, popularity | Wikipedia + Wikimedia Commons | Page views over 30 days stand in for "popular" |
| Weather | Open-Meteo | 16-day forecast; beyond that, last year's weather for the same dates |
| Directions | Links to Apple Maps (iPhone) / Google Maps (Android) | Opens the phone's maps app |

Known limits of free data: no star ratings, prices mostly only on Wikivoyage
picks, transit fares only where Wikivoyage's "Get around" text mentions them,
thin coverage in smaller towns, and no dated concerts/shows. Considered and set
aside: Google Places (its terms forbid storing data for offline use) and
Ticketmaster (free key; could add dated events later).

## Updating

Saved data only changes when she taps refresh, edits a trip, or opens a mode
(Walk/Car) for the first time on a trip. Walk and Car results are saved
separately. "Where am I?" also only updates on a tap. Pull-to-refresh is off.

## Screens

1. **Trips list** — "Where am I?" pinned at the top, then saved trips
   (upcoming first, past trips below).
2. **New / edit trip** — search a destination or use current location; dates on
   a calendar popup or typed into From/To boxes, with a "Just today" shortcut;
   Walk / Car toggle (sets search distance).
3. **Trip page** — photo header, dates, "saved offline" status, Refresh button.
   Tabs: **Eat · Explore · Transit · Weather · About**. Explore opens with events during
   the trip. Tap any item for details: photo, description, hours or event dates,
   price, address, phone, website, directions.

## Search distance

About a 30-minute walk (2.4 km) or a 20–30 minute drive (20 km), for food,
sights, and stations. Bus stops: nearest within 500 m, on foot only. Overpass
queries for every restaurant stay small (1.2–1.5 km) because big cities return
thousands; beyond that only places with a Wikipedia entry are queried there.

## Milestones

1. **First working slice (now):** app shell, trips list, new-trip form, trip page
   with all five tabs, offline storage, installable manifest, unit tests for the
   data parsers.
2. **Phone testing:** deploy to a free HTTPS host; install on Android, then iPhone.
3. **Polish:** "open now" badges in local time, maps view, filters (price, cuisine),
   Wikidata enrichment for listings missing coordinates/photos, °F/°C and mi/km
   toggle refinements.
4. **Nice to have:** share a trip between phones, packing notes per trip.

## Testing

- `npm test` — unit tests (Vitest) for parsers, ranking, events, and weather logic.
- `npm run dev` — local preview in a desktop browser.
- Android over USB (no hosting needed): `npm run build && npm run preview`, then
  `adb reverse tcp:4173 tcp:4173` and open `http://localhost:4173` on the phone.
  In Brave the install option is in the ⋮ menu (scroll down: "Add to Home screen").
- Android/iPhone once hosted: Chrome → menu → "Install app"; Safari → Share →
  "Add to Home Screen".
