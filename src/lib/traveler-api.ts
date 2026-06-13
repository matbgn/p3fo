import { City, getCityByCode, getFlightDurationMs } from './traveler-types';

const MOTIS_API_BASE = 'https://api.transitous.org';

interface CacheEntry {
  duration: number;
  timestamp: number;
}

const durationCache = new Map<string, CacheEntry>();
const geoCache = new Map<string, { lat: number; lng: number } | null>();
const CACHE_TTL = 60 * 60 * 1000;

function cacheKey(fromCode: string, toCode: string, mode: string): string {
  return `${mode}:${fromCode}-${toCode}`;
}

export async function fetchFlightDuration(from: City, to: City): Promise<number | null> {
  const key = cacheKey(from.code, to.code, 'flight');
  const cached = durationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.duration;
  }

  const precomputed = getFlightDurationMs(from.code, to.code);
  if (precomputed !== undefined) {
    durationCache.set(key, { duration: precomputed, timestamp: Date.now() });
    return precomputed;
  }

  return computeFlightDurationFallback(from, to);
}

export async function geocodePlace(query: string): Promise<{ lat: number; lng: number } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const cached = geoCache.get(trimmed.toLowerCase());
  if (cached !== undefined) return cached;

  try {
    const url = `${MOTIS_API_BASE}/api/v1/geocode?text=${encodeURIComponent(trimmed)}&limit=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'p3fo-traveler-timer/1.0' },
    });
    if (!response.ok) {
      geoCache.set(trimmed.toLowerCase(), null);
      return null;
    }
    const data = await response.json();
    const features = Array.isArray(data)
      ? data
      : Array.isArray(data?.features)
        ? data.features
        : [];
    const feature = features[0];
    if (!feature) {
      geoCache.set(trimmed.toLowerCase(), null);
      return null;
    }
    const coords = feature.geometry?.coordinates;
    const lat = Number(
      (Array.isArray(coords) ? coords[1] : undefined) ?? feature.lat,
    );
    const lng = Number(
      (Array.isArray(coords) ? coords[0] : undefined) ?? feature.lon ?? feature.lng,
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      geoCache.set(trimmed.toLowerCase(), null);
      return null;
    }
    const result = { lat, lng };
    geoCache.set(trimmed.toLowerCase(), result);
    return result;
  } catch {
    geoCache.set(trimmed.toLowerCase(), null);
    return null;
  }
}

export async function fetchMotisDuration(
  fromQuery: string,
  toQuery: string,
  _mode: 'TRAIN' | 'BUS' | 'AIRPLANE'
): Promise<number | null> {
  const [fromGeo, toGeo] = await Promise.all([
    geocodePlace(fromQuery),
    geocodePlace(toQuery),
  ]);
  if (!fromGeo || !toGeo) return null;

  const key = cacheKey(`${fromGeo.lat},${fromGeo.lng}`, `${toGeo.lat},${toGeo.lng}`, _mode);
  const cached = durationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.duration;
  }

  try {
    const url = `${MOTIS_API_BASE}/api/v6/plan?fromPlace=${fromGeo.lat},${fromGeo.lng}&toPlace=${toGeo.lat},${toGeo.lng}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'p3fo-traveler-timer/1.0' },
    });
    if (!response.ok) return null;

    const data = await response.json();
    const itineraries = data?.itineraries ?? data?.plan?.itineraries;
    if (!itineraries || !Array.isArray(itineraries) || itineraries.length === 0) return null;

    let minDuration = Infinity;
    for (const it of itineraries) {
      if (it?.duration && typeof it.duration === 'number') {
        const durationMs = it.duration * 1000;
        if (durationMs < minDuration) {
          minDuration = durationMs;
        }
      }
    }
    if (minDuration === Infinity) return null;

    durationCache.set(key, { duration: minDuration, timestamp: Date.now() });
    return minDuration;
  } catch {
    return null;
  }
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeFlightDurationFallback(from: City, to: City): number {
  const distKm = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const speed = distKm > 1500 ? 900 : 600;
  const overheadMs = 30 * 60 * 1000;
  return (distKm / speed) * 3600 * 1000 + overheadMs;
}

export function computeBreakDuration(travelDurationMs: number): number {
  return Math.max(60000, Math.round(travelDurationMs / 5));
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export async function getFlightDuration(
  departureCode: string,
  destinationCode: string
): Promise<{ travelDurationMs: number; breakDurationMs: number; isLoading: boolean } | null> {
  const from = getCityByCode(departureCode);
  const to = getCityByCode(destinationCode);
  if (!from || !to) return null;

  const travelMs = await fetchFlightDuration(from, to);
  if (travelMs === null) return null;

  const breakMs = computeBreakDuration(travelMs);
  return { travelDurationMs: travelMs, breakDurationMs: breakMs, isLoading: false };
}

export async function getTrainDuration(
  departureQuery: string,
  destinationQuery: string
): Promise<{ travelDurationMs: number; breakDurationMs: number } | null> {
  const travelMs = await fetchMotisDuration(departureQuery, destinationQuery, 'TRAIN');
  if (travelMs === null) return null;
  const breakMs = computeBreakDuration(travelMs);
  return { travelDurationMs: travelMs, breakDurationMs: breakMs };
}