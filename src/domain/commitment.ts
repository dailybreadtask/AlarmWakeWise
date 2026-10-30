export interface Commitment {
  id: string;
  intentId: string;
  /** What the person wants to be able to do, in their own words. */
  outcome: string;
  /** Deadline as a UTC instant. Null when the person has not given one. */
  deadlineAt: string | null;
  timezone: string;
  /** Saved place id, not an address. */
  placeId: string | null;
  recurrence: 'once' | 'weekly';
  importance: 'low' | 'normal' | 'high';
}
