import nativePlaces, { type PlaceSuggestion, type ResolvedPlace, type WakeWisePlacesNativeModule } from '../../modules/wakewise-alarm/places';

export type { PlaceSuggestion, ResolvedPlace };

export interface PlaceSearch {
  isSupported(): boolean;
  suggest(query: string): Promise<PlaceSuggestion[]>;
  resolve(id: string): Promise<ResolvedPlace | null>;
}

const UNSUPPORTED: PlaceSearch = {
  isSupported: () => false,
  suggest: async () => [],
  resolve: async () => null,
};

export function searchFrom(native: WakeWisePlacesNativeModule | null): PlaceSearch {
  if (!native) return UNSUPPORTED;
  return {
    isSupported: () => true,
    // A failed lookup is the same as no suggestions. Typing the place by hand always works.
    suggest: (query) => native.suggest(query).catch(() => []),
    resolve: (id) => native.resolve(id).catch(() => null),
  };
}

/** Apple Maps place suggestions. Unsupported on Android, web and Expo Go, where the module is not linked. */
export const placeSearch: PlaceSearch = searchFrom(nativePlaces);
