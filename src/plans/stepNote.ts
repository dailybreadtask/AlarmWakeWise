import type { TimelineEntry } from '../domain/planner';

/** The short line under a step: where its time came from, or what it is. Null when there is nothing to add. */
export function stepNote(entry: TimelineEntry): string | null {
  if (entry.kind === 'arrive') return `${entry.minutes} min spare`;
  if (entry.kind === 'timer') return `${entry.minutes} min timer`;
  if (entry.source === 'estimated') return 'Estimate, you can change it';
  if (entry.source === 'user') return `${entry.minutes} min, from you`;
  return null;
}

/** The label on the button that completes a step. */
export function stepDoneLabel(entry: TimelineEntry): string {
  if (entry.kind === 'travel') return 'On my way';
  if (entry.kind === 'arrive') return 'I’m here';
  return 'Done';
}
