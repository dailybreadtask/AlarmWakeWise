/** `speech`: send a recording for speech to text. `ai_reading`: send request text to the AI service to understand it. `journey_watch`: let the server watch a saved journey overnight and send a notification. All off until the person allows them. */
export type ContextScope = 'calendar' | 'notifications' | 'location' | 'routine' | 'speech' | 'ai_reading' | 'journey_watch';

export type FactSource = { kind: 'user' } | { kind: 'device' } | { kind: 'provider'; provider: string } | { kind: 'mock' };

export interface ContextFact {
  id: string;
  kind: string;
  value: string;
  source: FactSource;
  /** `confirmed` by the person. `inferred` facts are suggestions until approved. */
  status: 'confirmed' | 'inferred';
  /** Scope that allowed the fact to be read or stored. Null when none is needed. */
  scope: ContextScope | null;
  asOf: string;
  expiresAt: string | null;
}

export function isFactExpired(fact: ContextFact, now: Date): boolean {
  return fact.expiresAt !== null && now >= new Date(fact.expiresAt);
}
