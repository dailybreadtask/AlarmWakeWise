import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { useConsent } from '../consent/ConsentProvider';
import { speechConfig } from '../config';
import { listPlaces } from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { fetchTodayWeather, type WeatherSummary } from './weatherClient';

/**
 * Today's weather at the person's home, or the first place they have saved. A place found by search is looked up by its coordinates, and any other by its town or city. Nothing is asked until they allow it
 * in Speech and privacy. Null while loading, when nothing is allowed or saved, or when the weather is unavailable.
 */
export function useTodayWeather(): WeatherSummary | null {
  const { hasConsent } = useConsent();
  const db = useSQLiteContext();
  const allowed = hasConsent('location');
  const [summary, setSummary] = useState<WeatherSummary | null>(null);

  useEffect(() => {
    if (!allowed || !speechConfig.baseUrl) return;
    let active = true;
    void (async () => {
      const places = await listPlaces(sqlFrom(db));
      const place = places.find((p) => p.kind === 'home') ?? places[0];
      if (!place) return;
      const where = place.latitude !== null && place.longitude !== null ? { latitude: place.latitude, longitude: place.longitude } : place.area ? { name: place.area } : null;
      if (!where) return;
      const result = await fetchTodayWeather(where, { baseUrl: speechConfig.baseUrl, token: speechConfig.token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (active && result.ok) setSummary(result.weather);
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [allowed, db]);

  return allowed ? summary : null;
}
