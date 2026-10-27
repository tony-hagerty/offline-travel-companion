import type { Units } from '../types';

// WMO weather codes used by Open-Meteo. https://open-meteo.com/en/docs
const CODES: Record<number, [string, string]> = {
  0: ['Clear', '☀️'],
  1: ['Mostly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'],
  80: ['Showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Heavy showers', '🌧️'],
  85: ['Snow showers', '🌨️'],
  86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm, hail', '⛈️'],
  99: ['Thunderstorm, hail', '⛈️'],
};

export function describeWeather(code: number): { label: string; icon: string } {
  const [label, icon] = CODES[code] ?? ['Unknown', '🌡️'];
  return { label, icon };
}

export function formatTemp(celsius: number, units: Units): string {
  const v = units === 'imperial' ? celsius * 1.8 + 32 : celsius;
  return `${Math.round(v)}°`;
}

export function formatWind(kmh: number, units: Units): string {
  return units === 'imperial' ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`;
}

export function formatPrecip(mm: number, units: Units): string {
  return units === 'imperial' ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`;
}
