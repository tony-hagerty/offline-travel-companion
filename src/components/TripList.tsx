import type { Trip } from '../types';
import { busyKey, enableLocation, setUnits, updateCurrentLocation, useStore } from '../data/store';
import { guideFor, latestWeather, sharedInfo } from '../lib/trips';
import { formatDateRange, timeAgo, todayISO } from '../lib/dates';
import { href, go } from '../lib/router';
import { describeWeather, formatTemp } from '../lib/weatherCodes';
import { useOnline } from '../lib/useOnline';
import { Icon } from './Icon';

export function TripList() {
  const { trips, busy, units, locationEnabled, locationError, loaded } = useStore();
  const online = useOnline();
  const today = todayISO();
  // Before the current-location entry exists, any download for it means we're still locating her.
  const locating = Object.keys(busy).some((k) => k.startsWith('current:'));
  const current = trips.find((t) => t.kind === 'current');
  const destinations = trips.filter((t) => t.kind === 'destination');
  const upcoming = destinations.filter((t) => t.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = destinations.filter((t) => t.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="page">
      <header className="list-header">
        <h1>Trips</h1>
        <button
          className="units-toggle"
          onClick={() => setUnits(units === 'imperial' ? 'metric' : 'imperial')}
          aria-label={`Switch to ${units === 'imperial' ? 'metric' : 'imperial'} units`}
        >
          {units === 'imperial' ? '°F · mi' : '°C · km'}
        </button>
      </header>

      {!online && (
        <p className="banner banner-offline">
          <Icon name="cloudOff" size={16} /> Offline — your saved trips still work.
        </p>
      )}

      <section aria-label="Current location">
        {current ? (
          <TripCard trip={current} busy={!!busy[busyKey(current.id, current.mode)]} units={units} />
        ) : (
          <button
            className="card card-location"
            onClick={() => (locationEnabled ? updateCurrentLocation() : enableLocation())}
            disabled={!online || locating}
          >
            <span className="card-location-icon">
              <Icon name="locate" size={22} />
            </span>
            <span>
              <strong>{locating ? 'Finding you…' : 'Where am I?'}</strong>
              <span className="muted">
                {online ? 'Show food, sights, transit and weather around you' : 'Needs a connection the first time'}
              </span>
            </span>
          </button>
        )}
        {locationError && <p className="error-text">{locationError}</p>}
      </section>

      {loaded && destinations.length === 0 && (
        <div className="empty">
          <p>No trips yet.</p>
          <p className="muted">Add a destination and dates, and everything gets saved for offline use.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="section-title">Upcoming</h2>
          {upcoming.map((t) => (
            <TripCard key={t.id} trip={t} busy={!!busy[busyKey(t.id, t.mode)]} units={units} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="section-title">Past</h2>
          {past.map((t) => (
            <TripCard key={t.id} trip={t} busy={!!busy[busyKey(t.id, t.mode)]} units={units} />
          ))}
        </section>
      )}

      <button className="fab" onClick={() => go(['new'])}>
        <Icon name="plus" /> New trip
      </button>
    </div>
  );
}

function TripCard({ trip, busy, units }: { trip: Trip; busy: boolean; units: 'imperial' | 'metric' }) {
  const g = guideFor(trip);
  const image = sharedInfo(trip).about?.image;
  const now = latestWeather(trip)?.weather.current;
  const isCurrent = trip.kind === 'current';
  const status = busy ? 'Updating…' : g?.fetchedAt ? `Saved · updated ${timeAgo(g.fetchedAt)}` : 'Not downloaded yet';

  return (
    <a className="card trip-card" href={href('trip', trip.id)}>
      <div className="trip-card-image" style={image ? { backgroundImage: `url("${image}")` } : undefined}>
        {!image && <Icon name={isCurrent ? 'locate' : 'pin'} size={26} />}
      </div>
      <div className="trip-card-body">
        <div className="trip-card-eyebrow">{isCurrent ? 'Current location' : formatDateRange(trip.startDate, trip.endDate)}</div>
        <div className="trip-card-title">{trip.place.name}</div>
        <div className="trip-card-meta">
          {g?.fetchedAt && !busy ? <Icon name="check" size={14} /> : null}
          {status}
        </div>
      </div>
      {now && isCurrent && (
        <div className="trip-card-weather" title={describeWeather(now.code).label}>
          <span>{describeWeather(now.code).icon}</span>
          <span>{formatTemp(now.temp, units)}</span>
        </div>
      )}
    </a>
  );
}
