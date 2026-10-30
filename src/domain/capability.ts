import type { ContextFact, ContextScope } from './context';

/** The closed list. The model may request only these ids. */
export const CAPABILITY_IDS = ['alarm', 'timer', 'reminder', 'calendar', 'weather', 'rail', 'transit', 'road', 'roadworks', 'flight'] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type CapabilityErrorKind = 'unavailable' | 'timeout' | 'stale' | 'not_found' | 'permission_denied' | 'invalid_input';

export type CapabilityResult = { ok: true; facts: ContextFact[]; asOf: string } | { ok: false; error: CapabilityErrorKind; message: string };

export interface Capability<I> {
  id: CapabilityId;
  permission: ContextScope | null;
  /** True when the request leaves the device. */
  external: boolean;
  /** Maximum age of a result before it is shown as stale. */
  freshnessSeconds: number;
  /** Validates the input. Returns an error message, or null when the input is usable. */
  validate(input: I): string | null;
  invoke(input: I, now: Date): Promise<CapabilityResult>;
}

/** A mock never presents itself as live data. */
export function mockSourceLabel(fact: ContextFact): string {
  return fact.source.kind === 'mock' ? 'Synthetic test data' : 'Live';
}
