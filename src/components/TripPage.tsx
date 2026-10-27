import { useEffect, useMemo, useState } from 'react';
import type { Listing, Section, Trip, Units } from '../types';
import { busyKey, ensureGuide, refreshTrip, updateCurrentLocation, updateTrip, useStore } from '../data/store';
import { guideFor, sharedInfo, splitEvents } from '../lib/trips';
import { formatDateRange, timeAgo } from '../lib/dates';
import { back, go, href } from '../lib/router';
import { useOnline } from '../lib/useOnline';
import { formatDistance } from '../lib/geo';
import { GROUP_ICON, directionsUrl } from '../lib/links';
import { Icon } from './Icon';
import { ModeToggle } from './ModeToggle';
import { ListingDetail } from './ListingDetail';
import { WeatherTab } from './WeatherTab';

const TABS: { id: Section; label: string }[] = [
  { id: 'eat', label: 'Eat' },
  { id: 'see', label: 'See' },
  { id: 'transit', label: 'Transit' },
  { id: 'weather', label: 'Weather' },
  { id: 'about', label: 'About' },
];

export function TripPage({ tripId, tab, itemId }: { tripId: string; tab?: string; itemId?: string }) {
  const { trips, busy, units } = useStore();
  const online = useOnline();
  const trip = trips.find((t) => t.id === tripId);
  const active: Section = TABS.some((t) => t.id === tab) ? (tab as Section) : 'eat';

  // Download a mode the first time it's shown; after that only the refresh button updates it.
  useEffect(() => {
    if (trip && online) ensureGuide(trip.id);
  }, [tripId, trip?.mode, online]);

  if (!trip) {
    return (
      <div className="page">
        <header className="topbar">
          <button className="icon-btn" onClick={() => go([], true)} aria-label="Back">
            <Icon name="back" />
          </button>
        </header>
        <p className="empty">This trip doesn’t exist anymore.</p>
      </div>
    );
  }

  const g = guideFor(trip);
  const shared = sharedInfo(trip);
  const isBusy = !!busy[busyKey(trip.id, trip.mode)];
  const modeName = trip.mode === 'walk' ? 'Walk' : 'Car';
  const placesTab = active === 'eat' || active === 'see' || active === 'transit';
  const isCurrent = trip.kind === 'current';
  const listings = active === 'eat' ? g?.eat : active === 'see' ? g?.see : active === 'transit' ? g?.transit : undefined;
  const selectable = [...(listings ?? []), ...(active === 'see' ? shared.events : [])];
  const selected = itemId ? selectable.find((l) => l.id === itemId) : undefined;

  const refresh = () => (isCurrent ? updateCurrentLocation() : refreshTrip(trip.id));

  return (
    <div className="page trip-page">
      <div className="hero" style={shared.about?.image ? { backgroundImage: `url("${shared.about.image}")` } : undefined}>
        <div className="hero-scrim" />
        <header className="topbar topbar-hero">
          <button className="icon-btn" onClick={() => back()} aria-label="Back to trips">
            <Icon name="back" />
          </button>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={refresh} disabled={!online || isBusy} aria-label="Refresh">
              <span className={isBusy ? 'icon-wrap spin' : 'icon-wrap'}>
                <Icon name="refresh" />
              </span>
            </button>
            {!isCurrent && (
              <a className="icon-btn" href={href('trip', trip.id, 'edit')} aria-label="Edit trip">
                <Icon name="edit" />
              </a>
            )}
          </div>
        </header>
        <div className="hero-text">
          <div className="hero-eyebrow">{isCurrent ? 'You are here' : formatDateRange(trip.startDate, trip.endDate)}</div>
          <h1>{trip.place.name}</h1>
          <div className="hero-sub">{trip.place.label}</div>
        </div>
      </div>

      <div className="status-row">
        <StatusLine trip={trip} busy={isBusy} online={online} />
        <ModeToggle value={trip.mode} onChange={(mode) => updateTrip(trip.id, { mode })} />
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <a
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? 'tab on' : 'tab'}
            href={href('trip', trip.id, t.id)}
            onClick={(e) => {
              // Switching tabs replaces history so Back leaves the trip instead of cycling tabs.
              e.preventDefault();
              go(['trip', trip.id, t.id], true);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <main className="tab-body">
        {g?.errors[active] && (
          <p className="banner banner-warn">Some info couldn’t be updated ({g.errors[active]}). Showing what we have.</p>
        )}
        {g?.partial && !isBusy && placesTab && !g.errors[active] && (
          <p className="banner banner-info">Some details are still missing. Tap refresh to try again.</p>
        )}
        {!g && placesTab && (
          <p className="empty">
            {isBusy
              ? `Downloading ${modeName} results…`
              : online
                ? 'Tap refresh to download.'
                : `${modeName} results haven’t been downloaded yet. Connect to the internet to get them.`}
          </p>
        )}
        {active === 'see' && <EventsSection trip={trip} units={units} />}
        {g && (active === 'eat' || active === 'see') && (
          <ListingList trip={trip} listings={listings ?? []} units={units} tab={active} />
        )}
        {g && active === 'transit' && <TransitTab trip={trip} units={units} />}
        {active === 'weather' && <WeatherTab trip={trip} units={units} />}
        {active === 'about' && <AboutTab trip={trip} />}
      </main>

      {selected && (
        <ListingDetail
          listing={selected}
          trip={trip}
          units={units}
          onClose={() => back(['trip', trip.id, active])}
        />
      )}
    </div>
  );
}

function StatusLine({ trip, busy, online }: { trip: Trip; busy: boolean; online: boolean }) {
  const g = guideFor(trip);
  if (busy) return <span className="status">Downloading for offline…</span>;
  if (!g) return <span className="status">Not downloaded yet</span>;
  return (
    <span className="status">
      <Icon name={online ? 'check' : 'cloudOff'} size={14} />
      {online ? 'Saved offline' : 'Offline'} · updated {timeAgo(g.fetchedAt)}
    </span>
  );
}

const FILTERS: Record<'eat' | 'see', { id: string; label: string; groups: string[] }[]> = {
  eat: [
    { id: 'restaurant', label: 'Restaurants', groups: ['restaurant'] },
    { id: 'cafe', label: 'Cafés', groups: ['cafe'] },
    { id: 'quick', label: 'Quick bites', groups: ['fast_food'] },
    { id: 'drinks', label: 'Drinks', groups: ['drinks'] },
  ],
  see: [
    { id: 'sight', label: 'Sights', groups: ['sight'] },
    { id: 'museum', label: 'Museums', groups: ['museum'] },
    { id: 'park', label: 'Parks', groups: ['park'] },
    { id: 'family', label: 'Family', groups: ['family'] },
    { id: 'activity', label: 'Activities', groups: ['activity'] },
  ],
};

function ListingList({ trip, listings, units, tab }: { trip: Trip; listings: Listing[]; units: Units; tab: 'eat' | 'see' }) {
  const [filter, setFilter] = useState<string>('all');
  const [picksOnly, setPicksOnly] = useState(false);
  const filters = FILTERS[tab].filter((f) => listings.some((l) => f.groups.includes(l.group)));
  const hasPicks = listings.some((l) => l.guidePick);

  const shown = useMemo(() => {
    const f = FILTERS[tab].find((x) => x.id === filter);
    return listings.filter((l) => (!f || f.groups.includes(l.group)) && (!picksOnly || l.guidePick));
  }, [listings, filter, picksOnly, tab]);

  if (!listings.length) {
    return (
      <p className="empty">
        {guideFor(trip)?.partial ? 'Still loading nearby places…' : 'Nothing found nearby. Try switching to Car for a wider area.'}
      </p>
    );
  }

  return (
    <>
      <div className="chips" role="toolbar" aria-label="Filter">
        <button className={`chip ${filter === 'all' ? 'chip-on' : ''}`} onClick={() => setFilter('all')}>All</button>
        {filters.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'chip-on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        {hasPicks && (
          <button className={`chip ${picksOnly ? 'chip-on' : ''}`} onClick={() => setPicksOnly(!picksOnly)}>
            ★ Guide picks
          </button>
        )}
      </div>
      <ul className="listings">
        {shown.map((l) => (
          <ListingRow key={l.id} listing={l} trip={trip} units={units} tab={tab} />
        ))}
      </ul>
      <p className="credit">
        Data from Wikivoyage, OpenStreetMap, and Wikipedia. Hours and prices can change — check before you go.
      </p>
    </>
  );
}

/** Festivals and recurring events, with the ones on the trip's dates first. */
function EventsSection({ trip, units }: { trip: Trip; units: Units }) {
  const { during, other } = splitEvents(trip);
  if (!during.length && !other.length) return null;
  return (
    <section className="events">
      <h2 className="section-title">{trip.kind === 'current' ? 'Happening around now' : 'During your trip'}</h2>
      {during.length > 0 ? (
        <ul className="listings">
          {during.map((l) => (
            <ListingRow key={l.id} listing={l} trip={trip} units={units} tab="see" />
          ))}
        </ul>
      ) : (
        <p className="muted small">No festivals or regular events are listed for these dates.</p>
      )}
      {other.length > 0 && (
        <details className="more-events">
          <summary>Other yearly events ({other.length})</summary>
          <ul className="listings">
            {other.map((l) => (
              <ListingRow key={l.id} listing={l} trip={trip} units={units} tab="see" />
            ))}
          </ul>
        </details>
      )}
      <h2 className="section-title">Places to see</h2>
    </section>
  );
}

function ListingRow({ listing: l, trip, units, tab }: { listing: Listing; trip: Trip; units: Units; tab: string }) {
  // For events the "hours" are the dates, already shown in the meta line.
  const firstHours = l.event ? undefined : l.hours?.split('\n')[0];
  const where = l.event ? l.event.when : l.distance !== undefined ? formatDistance(l.distance, trip.mode, units) : undefined;
  return (
    <li>
      <a className="listing" href={href('trip', trip.id, tab, l.id)}>
        <div className="listing-thumb">
          {l.image ? <img src={l.image} alt="" loading="lazy" crossOrigin="anonymous" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
          <span aria-hidden="true">{GROUP_ICON[l.group] ?? '📍'}</span>
        </div>
        <div className="listing-body">
          <div className="listing-title">
            {l.name}
            {l.guidePick && <span className="pick" title="Recommended by Wikivoyage">★</span>}
          </div>
          <div className="listing-meta">
            {[l.category, where].filter(Boolean).join(' · ')}
          </div>
          {(l.priceTier || l.price || firstHours) && (
            <div className="listing-facts">
              {l.priceTier && <span className="price-tier">{'$'.repeat(l.priceTier)}</span>}
              {firstHours && (
                <span className="truncate">
                  <Icon name="clock" size={13} /> {firstHours}
                </span>
              )}
            </div>
          )}
        </div>
      </a>
    </li>
  );
}

function TransitTab({ trip, units }: { trip: Trip; units: Units }) {
  const g = guideFor(trip)!;
  const { getAround, getAroundSource } = sharedInfo(trip);
  return (
    <>
      {getAround.length > 0 && (
        <details className="get-around" open>
          <summary>Getting around {trip.place.name}</summary>
          {getAround.map((s, i) => (
            <div key={i}>
              {s.heading && <h3>{s.heading}</h3>}
              {s.paragraphs.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          ))}
          {getAroundSource && (
            <a className="source-link" href={getAroundSource} target="_blank" rel="noreferrer">
              Full guide on Wikivoyage <Icon name="external" size={14} />
            </a>
          )}
        </details>
      )}
      <h2 className="section-title">Nearby stations and stops</h2>
      {g.transit.length === 0 ? (
        <p className="empty">{g.partial ? 'Still loading stations…' : 'No stations found nearby.'}</p>
      ) : (
        <ul className="listings">
          {g.transit.map((l) => (
            <ListingRow key={l.id} listing={l} trip={trip} units={units} tab="transit" />
          ))}
        </ul>
      )}
      <a className="secondary-btn" href={directionsUrl({ name: trip.place.name, lat: trip.place.lat, lon: trip.place.lon }, 'transit')} target="_blank" rel="noreferrer">
        <Icon name="directions" size={18} /> Transit directions in Maps
      </a>
    </>
  );
}

function AboutTab({ trip }: { trip: Trip }) {
  const a = sharedInfo(trip).about;
  if (!a) return <p className="empty">No overview found for this place.</p>;
  return (
    <article className="about">
      {a.extract.split('\n').filter(Boolean).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <a className="source-link" href={a.url} target="_blank" rel="noreferrer">
        Read more about {a.title} <Icon name="external" size={14} />
      </a>
    </article>
  );
}
