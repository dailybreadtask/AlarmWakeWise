import type { Interpretation } from '../domain/interpretation';

export type TravelMode = 'bus' | 'train' | 'car' | 'walk' | 'cycle' | 'taxi' | 'other';

export interface EstimateNeed {
  mode: Exclude<TravelMode, 'train'>;
  from: string;
  to: string;
}

/** The capabilities the reading may use for a journey, and the mode each one means. */
const CAPABILITY_MODE: Record<string, TravelMode> = { transit: 'bus', road: 'car', rail: 'train' };

/**
 * What the journey needs, from the reading. 'train' is handled by the live
 * timetable, so it is not returned here. 'needs_mode' means the places are
 * known but the way of travelling is not.
 */
export function journeyNeed(interpretation: Interpretation): EstimateNeed | 'needs_mode' | null {
  const journey = interpretation.requests.find((r) => r.capability in CAPABILITY_MODE && r.params.from && r.params.to);
  if (!journey) {
    const placesOnly = interpretation.requests.find((r) => r.params.from && r.params.to);
    return placesOnly ? 'needs_mode' : null;
  }
  const mode = CAPABILITY_MODE[journey.capability];
  if (mode === 'train') return null;
  return { mode, from: String(journey.params.from), to: String(journey.params.to) };
}

/** The time to plan with: the top of the estimated range, rounded up to the next 5 minutes. */
export function minutesFromEstimate(low: number, high: number): number {
  return Math.ceil(high / 5) * 5;
}
