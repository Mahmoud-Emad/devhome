// Local handler for weather. Open-Meteo is key-free and CORS-enabled, so the
// extension fetches it directly.
import { register } from '../lib/localRouter.js';

// WMO weather code → [label, group]; group drives the frontend icon.
const CODES = {
  0: ['Clear sky', 'clear'], 1: ['Mainly clear', 'clear'], 2: ['Partly cloudy', 'cloud'], 3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Rime fog', 'fog'],
  51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Dense drizzle', 'rain'],
  56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Violent showers', 'rain'],
  85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};

const round = (n) => (n == null ? null : Math.round(n));
const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

register('GET', 'weather', async ({ query }) => {
  const unit = String(query.unit || '').toLowerCase().startsWith('f') ? 'fahrenheit' : 'celsius';
  const params = new URLSearchParams({
    latitude: Number(query.lat).toFixed(3),
    longitude: Number(query.lon).toFixed(3),
    current: 'temperature_2m,weather_code,wind_speed_10m,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    temperature_unit: unit,
    wind_speed_unit: 'kmh',
    timezone: 'auto',
    forecast_days: '1',
  });

  let data;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    throw new Error(`Couldn't reach the weather service: ${err.message || err}`);
  }

  const cur = data.current || {};
  const daily = data.daily || {};
  const [condition, group] = CODES[cur.weather_code] || ['—', 'cloud'];
  return {
    temp: round(cur.temperature_2m),
    unit: unit === 'fahrenheit' ? '°F' : '°C',
    code: cur.weather_code,
    condition,
    group,
    isDay: Boolean(cur.is_day ?? 1),
    wind: round(cur.wind_speed_10m),
    high: round(first(daily.temperature_2m_max)),
    low: round(first(daily.temperature_2m_min)),
  };
});
