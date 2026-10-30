import type { ContextScope } from '../domain/context';

export interface ConsentEntry {
  granted: boolean;
  /** When the person last changed this choice, UTC. */
  changedAt: string;
}

export type ConsentMap = Partial<Record<ContextScope, ConsentEntry>>;

/** Nothing is allowed until the person grants it. A missing entry means no. */
export function hasConsent(map: ConsentMap, scope: ContextScope): boolean {
  return map[scope]?.granted === true;
}

export function setConsent(map: ConsentMap, scope: ContextScope, granted: boolean, changedAt: string): ConsentMap {
  return { ...map, [scope]: { granted, changedAt } };
}
