import { requireOptionalNativeModule } from 'expo';

export interface PlaceSuggestion {
  /** Pass to resolve() to get this suggestion's coordinates. Only valid until the next suggest(). */
  id: string;
  title: string;
  subtitle: string;
}

export interface ResolvedPlace {
  name: string;
  /** The town or city, or an empty string when Apple Maps gives none. */
  area: string;
  latitude: number;
  longitude: number;
}

export interface WakeWisePlacesNativeModule {
  suggest(query: string): Promise<PlaceSuggestion[]>;
  resolve(id: string): Promise<ResolvedPlace | null>;
}

/** Null on Android, web and Expo Go, where the Apple Maps bridge is not linked. */
export default requireOptionalNativeModule<WakeWisePlacesNativeModule>('WakeWisePlaces');
