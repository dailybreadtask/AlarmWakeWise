import { step, type StepResult, type TransitionTable } from './machines';

export const MONITOR_STATES = ['inactive', 'active', 'degraded', 'expired', 'stopped'] as const;
export type MonitorState = (typeof MONITOR_STATES)[number];

export const MONITOR_EVENTS = ['start', 'check_ok', 'check_failed', 'expire', 'stop'] as const;
export type MonitorEvent = (typeof MONITOR_EVENTS)[number];

export const MONITOR_TRANSITIONS: TransitionTable<MonitorState, MonitorEvent> = {
  inactive: { start: 'active' },
  active: { check_ok: 'active', check_failed: 'degraded', expire: 'expired', stop: 'stopped' },
  degraded: { check_ok: 'active', expire: 'expired', stop: 'stopped' },
  expired: {},
  stopped: {},
};

export interface Monitor {
  id: string;
  planId: string;
  capability: string;
  state: MonitorState;
  /** The monitor only runs inside this window. */
  startsAt: string;
  endsAt: string;
  cadenceSeconds: number;
  lastCheckAt: string | null;
  lastObservedAt: string | null;
  /** How old a successful observation may be before it is shown as stale. */
  freshnessSeconds: number;
}

export function advanceMonitor(monitor: Monitor, event: MonitorEvent): StepResult<MonitorState> {
  return step(MONITOR_TRANSITIONS, monitor.state, event);
}

/**
 * The only test the UI may use to say "monitoring". A monitor that is active
 * but has not observed anything inside its freshness window is not monitoring.
 */
export function isMonitoring(monitor: Monitor, now: Date): boolean {
  if (monitor.state !== 'active' || monitor.lastObservedAt === null) return false;
  if (now < new Date(monitor.startsAt) || now >= new Date(monitor.endsAt)) return false;
  const ageSeconds = (now.getTime() - new Date(monitor.lastObservedAt).getTime()) / 1000;
  return ageSeconds <= monitor.freshnessSeconds;
}
