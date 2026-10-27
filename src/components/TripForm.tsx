import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Place, TravelMode } from '../types';
import { createTrip, deleteTrip, getTrip, updateTrip } from '../data/store';
import { searchPlaces, reverseGeocode } from '../sources/photon';
import { searchPlacesNominatim } from '../sources/nominatim';
import { addDays, formatDateRange, todayISO } from '../lib/dates';
import { back, go } from '../lib/router';
import { useOnline } from '../lib/useOnline';
import { Icon } from './Icon';
import { ModeToggle } from './ModeToggle';
import { DateRangeSheet } from './DateRangeSheet';

export function TripForm({ tripId }: { tripId?: string }) {
  const existing = tripId ? getTrip(tripId) : undefined;
  const online = useOnline();
  const today = todayISO();
  const [place, setPlace] = useState<Place | undefined>(existing?.place);
  const [startDate, setStartDate] = useState(existing?.startDate ?? today);
  const [endDate, setEndDate] = useState(existing?.endDate ?? addDays(today, 3));
  const [mode, setMode] = useState<TravelMode>(existing?.mode ?? 'walk');
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isToday = startDate === today && endDate === today;
  const canSave = !!place && startDate && endDate && endDate >= startDate && !saving;

  const save = async () => {
    if (!canSave || !place) return;
    setSaving(true);
    if (existing) {
      await updateTrip(existing.id, { place, startDate, endDate, mode });
      back(['trip', existing.id]);
    } else {
      const trip = await createTrip(place, startDate, endDate, mode);
      go(['trip', trip.id], true);
    }
  };

  const remove = async () => {
    if (!existing || !confirm(`Delete the trip to ${existing.place.name}?`)) return;
    await deleteTrip(existing.id);
    go([], true);
  };

  return (
    <div className="page form-page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => back()} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>{existing ? 'Edit trip' : 'New trip'}</h1>
      </header>

      <div className="field-label" id="dest-label">Destination</div>
      {place ? (
        <div className="selected-place">
          <Icon name="pin" />
          <div>
            <strong>{place.name}</strong>
            <span className="muted">{place.label}</span>
          </div>
          <button className="link-btn" onClick={() => setPlace(undefined)}>Change</button>
        </div>
      ) : (
        <PlaceSearch onPick={setPlace} online={online} />
      )}

      <div className="field-label">Dates</div>
      {/* Two ways in: pick both days on one calendar, or type each date below. */}
      <button className="date-summary" onClick={() => setCalendarOpen(true)}>
        <Icon name="calendar" />
        <span>{formatDateRange(startDate, endDate, today)}</span>
        <span className="link-btn">Calendar</span>
      </button>
      {calendarOpen && (
        <DateRangeSheet
          start={startDate}
          end={endDate}
          onClose={() => setCalendarOpen(false)}
          onDone={(s, e) => {
            setStartDate(s);
            setEndDate(e);
            setCalendarOpen(false);
          }}
        />
      )}
      <div className="date-row">
        <label className="date-field">
          <span>From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </label>
        <label className="date-field">
          <span>To</span>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <button
        className={`chip ${isToday ? 'chip-on' : ''}`}
        onClick={() => {
          setStartDate(today);
          setEndDate(today);
        }}
      >
        Just today
      </button>

      <div className="field-label">Getting around</div>
      <ModeToggle value={mode} onChange={setMode} />
      <p className="hint">
        {mode === 'walk' ? 'Shows places within about a 30-minute walk.' : 'Shows places within about a 20–30 minute drive.'}
      </p>

      {!online && <p className="banner banner-offline">You’re offline. The trip will download once you’re connected.</p>}

      <button className="primary-btn" disabled={!canSave} onClick={save}>
        {existing ? 'Save changes' : 'Create trip'}
      </button>

      {existing && (
        <button className="danger-btn" onClick={remove}>
          <Icon name="trash" size={18} /> Delete trip
        </button>
      )}
    </div>
  );
}

function PlaceSearch({ onPick, online }: { onPick: (p: Place) => void; online: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string>();
  const [locating, setLocating] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !online) {
      setResults([]);
      return;
    }
    const timer = (debounce.current = window.setTimeout(() => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      searchPlaces(q, ctrl.current.signal)
        .then((r) => {
          setResults(r);
          setError(undefined);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError('Search is slow right now. Press Enter to search.');
        });
    }, 300));
    return () => clearTimeout(timer);
  }, [query, online]);

  // Enter searches the backup geocoder, which (unlike Photon) mustn't be queried on every keystroke.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2 || !online) return;
    clearTimeout(debounce.current);
    ctrl.current?.abort();
    setError(undefined);
    searchPlacesNominatim(q)
      .then((r) => {
        setResults(r);
        if (!r.length) setError('No places found. Try a different spelling.');
      })
      .catch(() => setError('Search isn’t responding. Try again in a moment.'));
  };

  const useHere = () => {
    setLocating(true);
    setError(undefined);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude).catch(() => undefined);
        setLocating(false);
        if (place) onPick(place);
        else setError('Couldn’t look up your location.');
      },
      () => {
        setLocating(false);
        setError('Location permission is off for this app.');
      },
      { timeout: 15000 },
    );
  };

  return (
    <div className="place-search">
      <form className="search-box" onSubmit={submit} role="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          enterKeyHint="search"
          placeholder={online ? 'City, address, or landmark' : 'Search needs a connection'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-labelledby="dest-label"
          disabled={!online}
          autoFocus
        />
      </form>
      {results.length > 0 && (
        <ul className="suggestions">
          {results.map((p) => (
            <li key={`${p.lat},${p.lon},${p.label}`}>
              <button onClick={() => onPick(p)}>
                <strong>{p.name}</strong>
                <span className="muted">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="link-btn locate-btn" onClick={useHere} disabled={!online || locating}>
        <Icon name="locate" size={18} /> {locating ? 'Finding you…' : 'Use my current location'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
