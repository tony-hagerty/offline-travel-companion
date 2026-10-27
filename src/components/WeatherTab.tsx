import type { Trip, Units } from '../types';
import { parseISODate, timeAgo, todayISO } from '../lib/dates';
import { describeWeather, formatPrecip, formatTemp, formatWind } from '../lib/weatherCodes';
import { latestWeather } from '../lib/trips';

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  return parseISODate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "2026-10-26T07:12" → "7:12 AM" (already in the destination's local time). */
function clock(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function WeatherTab({ trip, units }: { trip: Trip; units: Units }) {
  const latest = latestWeather(trip);
  const today = todayISO();
  if (!latest) return <p className="empty">No weather downloaded yet.</p>;
  const w = latest.weather;
  const c = w.current;
  const hasLastYear = w.days.some((d) => d.kind === 'lastYear');

  return (
    <>
      {c && (
        <div className="weather-now card">
          <div className="weather-now-icon">{describeWeather(c.code).icon}</div>
          <div>
            <div className="weather-now-temp">{formatTemp(c.temp, units)}</div>
            <div>{describeWeather(c.code).label}</div>
            <div className="muted">
              Feels like {formatTemp(c.feelsLike, units)} · Humidity {c.humidity}% · Wind {formatWind(c.wind, units)}
            </div>
          </div>
        </div>
      )}
      <p className="muted small">
        Conditions at {trip.place.name} · updated {timeAgo(latest.fetchedAt)}
        {w.timezone ? ` · local time zone ${w.timezone}` : ''}
      </p>

      {hasLastYear && (
        <p className="banner banner-info">
          Forecasts only reach about 2 weeks ahead. Days marked “last year” show the weather on the same date last year, as a rough guide.
        </p>
      )}

      <ul className="weather-days">
        {w.days.map((d) => {
          const { icon, label } = describeWeather(d.code);
          return (
            <li key={d.date} className="weather-day">
              <div className="weather-day-date">
                {dayLabel(d.date, today)}
                {d.kind === 'lastYear' && <span className="tag">last year</span>}
              </div>
              <div className="weather-day-icon" title={label}>{icon}</div>
              <div className="weather-day-temps">
                <strong>{formatTemp(d.max, units)}</strong> <span className="muted">{formatTemp(d.min, units)}</span>
              </div>
              <div className="weather-day-extra muted">
                {d.precipChance !== null
                  ? `${d.precipChance}% rain`
                  : d.precipSum
                    ? `${formatPrecip(d.precipSum, units)} rain`
                    : 'Dry'}
                {d.sunrise && ` · ☀ ${clock(d.sunrise)}–${clock(d.sunset)}`}
                {d.uvMax !== undefined && d.uvMax >= 6 ? ` · UV ${Math.round(d.uvMax)}` : ''}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="credit">Weather from Open-Meteo.</p>
    </>
  );
}
