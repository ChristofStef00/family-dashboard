import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

let cache = { fetched: 0, payload: null, key: '' };
const TTL_MS = 30 * 60 * 1000;

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

router.get('/', async (_req, res) => {
  try {
    const lat = Number(getSetting('weather_lat', 37.7749));
    const lon = Number(getSetting('weather_lon', -122.4194));
    const units = getSetting('weather_units', 'fahrenheit');
    const tempUnit = units === 'celsius' ? 'celsius' : 'fahrenheit';
    const windUnit = units === 'celsius' ? 'kmh' : 'mph';

    const key = `${lat},${lon},${tempUnit}`;
    if (cache.payload && cache.key === key && Date.now() - cache.fetched < TTL_MS) {
      return res.json(cache.payload);
    }

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
    url.searchParams.set('daily',   'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset');
    url.searchParams.set('temperature_unit', tempUnit);
    url.searchParams.set('wind_speed_unit', windUnit);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '14');

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const data = await r.json();

    const payload = {
      location_name: getSetting('weather_location_name', ''),
      units: tempUnit,
      current: data.current,
      daily:   data.daily,
      fetched_at: new Date().toISOString()
    };
    cache = { fetched: Date.now(), payload, key };
    res.json(payload);
  } catch (e) {
    res.status(502).json({ error: 'Weather fetch failed', detail: String(e) });
  }
});

// Open-Meteo's geocoder only matches the bare city name; passing
// "Lehi, UT" hits zero results. We split the query at the first comma,
// search on the city portion, then optionally filter by the hint that
// followed (expanding US-state abbreviations along the way).
const US_STATES = {
  AL:'alabama', AK:'alaska', AZ:'arizona', AR:'arkansas', CA:'california',
  CO:'colorado', CT:'connecticut', DE:'delaware', FL:'florida', GA:'georgia',
  HI:'hawaii', ID:'idaho', IL:'illinois', IN:'indiana', IA:'iowa',
  KS:'kansas', KY:'kentucky', LA:'louisiana', ME:'maine', MD:'maryland',
  MA:'massachusetts', MI:'michigan', MN:'minnesota', MS:'mississippi',
  MO:'missouri', MT:'montana', NE:'nebraska', NV:'nevada', NH:'new hampshire',
  NJ:'new jersey', NM:'new mexico', NY:'new york', NC:'north carolina',
  ND:'north dakota', OH:'ohio', OK:'oklahoma', OR:'oregon', PA:'pennsylvania',
  RI:'rhode island', SC:'south carolina', SD:'south dakota', TN:'tennessee',
  TX:'texas', UT:'utah', VT:'vermont', VA:'virginia', WA:'washington',
  WV:'west virginia', WI:'wisconsin', WY:'wyoming', DC:'district of columbia'
};

router.get('/geocode', async (req, res) => {
  const raw = String(req.query.q || '').trim();
  if (!raw) return res.json({ results: [] });

  const cityPart = (raw.split(',')[0] || raw).trim();
  const hintRaw  = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1).trim() : '';
  const hint     = hintRaw.toLowerCase();
  const expanded = US_STATES[hintRaw.toUpperCase()] || hint;

  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', cityPart);
    url.searchParams.set('count', '20');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Geocoding ${r.status}`);
    const data = await r.json();
    let results = data.results || [];

    if (hint) {
      const narrowed = results.filter(item => {
        const fields = [item.admin1, item.admin2, item.country, item.country_code]
          .filter(Boolean).map(s => String(s).toLowerCase());
        return fields.some(f => f.includes(expanded) || f.includes(hint));
      });
      // Only narrow if the hint matched something; otherwise show the full
      // global list so users can still see what came back.
      if (narrowed.length > 0) results = narrowed;
    }

    res.json({ results: results.slice(0, 8) });
  } catch (e) {
    res.status(502).json({ error: 'Geocoding failed', detail: String(e) });
  }
});

export default router;
