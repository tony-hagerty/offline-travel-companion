import type { Weather, WeatherDay } from '../types';
import { addDays, dateRange } from '../lib/dates';
import { fetchJson, qs } from '../lib/http';

// Open-Meteo: free weather API, no key. Forecasts reach 16 days out; for dates past that we
// show the same dates from last year as a rough guide.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

/** How far back the forecast API serves past days, and how far ahead it forecasts. */
const PAST_DAYS = 60;
const FUTURE_DAYS = 15;

export function splitWeatherDates(dates: string[], today: string): { forecast: string[]; lastYear: string[] } {
  const first = addDays(today, -PAST_DAYS);
  const last = addDays(today, FUTURE_DAYS);
  const forecast = dates.filter((d) => d >= first && d <= last);
  const lastYear = dates.filter((d) => d > last || d < first);
  return { forecast, lastYear };
}

/** Same calendar day one year earlier (Feb 29 → Feb 28). */
export function yearBefore(iso: string): string {
  const [y, m, d] = iso.split('-');
  const day = m === '02' && d === '29' ? '28' : d;
  return `${Number(y) - 1}-${m}-${day}`;
}

interface Daily {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max?: (number | null)[];
  precipitation_sum?: (number | null)[];
  sunrise?: string[];
  sunset?: string[];
  uv_index_max?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
}

interface MeteoResponse {
  timezone?: string;
  daily?: Daily;
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
  };
}

export function dailyToDays(daily: Daily, kind: WeatherDay['kind'], dateMap?: Map<string, string>): WeatherDay[] {
  return daily.time.map((t, i) => ({
    date: dateMap?.get(t) ?? t,
    code: daily.weather_code[i],
    max: daily.temperature_2m_max[i],
    min: daily.temperature_2m_min[i],
    precipChance: daily.precipitation_probability_max?.[i] ?? null,
    precipSum: daily.precipitation_sum?.[i] ?? null,
    sunrise: daily.sunrise?.[i],
    sunset: daily.sunset?.[i],
    uvMax: daily.uv_index_max?.[i] ?? undefined,
    windMax: daily.wind_speed_10m_max?.[i] ?? undefined,
    kind,
  }));
}

/** Weather for every trip day (capped at 30 days), plus current conditions. Values are metric. */
export async function fetchWeather(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  today: string,
): Promise<Weather> {
  const dates = dateRange(startDate, endDate).slice(0, 30);
  const { forecast, lastYear } = splitWeatherDates(dates, today);

  const forecastUrl = `${FORECAST}?${qs({
    latitude: lat, longitude: lon, timezone: 'auto',
    current: 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max',
    ...(forecast.length ? { start_date: forecast[0], end_date: forecast[forecast.length - 1] } : { forecast_days: 1 }),
  })}`;

  const lastYearDates = lastYear.map(yearBefore);
  const archiveRequest = lastYear.length
    ? fetchJson<MeteoResponse>(
        `${ARCHIVE}?${qs({
          latitude: lat, longitude: lon, timezone: 'auto',
          start_date: lastYearDates[0], end_date: lastYearDates[lastYearDates.length - 1],
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset',
        })}`,
      )
    : Promise.resolve(undefined);

  const [fc, archive] = await Promise.all([fetchJson<MeteoResponse>(forecastUrl), archiveRequest]);

  const days: WeatherDay[] = [];
  if (forecast.length && fc.daily) days.push(...dailyToDays(fc.daily, 'forecast'));
  if (archive?.daily) {
    const back = new Map(lastYear.map((d, i) => [lastYearDates[i], d]));
    days.push(...dailyToDays(archive.daily, 'lastYear', back).filter((d) => lastYear.includes(d.date)));
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const c = fc.current;
  return {
    timezone: fc.timezone,
    current: c && {
      temp: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      code: c.weather_code,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      time: c.time,
    },
    days,
  };
}
