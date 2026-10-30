/**
 * The post-wake briefing. Built from what the app already knows, with the
 * source and time of each live fact. Anything not connected is said so, not left out.
 * It never delays or blocks the wake-up.
 */
import type { PlanOutcome } from '../domain/planner';
import type { BoardDeparture } from '../domain/railJourney';

export interface BriefingInput {
  goal: string;
  timezone: string;
  now: Date;
  /** The plan's timeline, if the person has a plan for today. */
  plan: Extract<PlanOutcome, { ok: true }> | null;
  /** The live train, if one was chosen, with the feed time it came from. */
  train: { label: string; departsAt: Date; status: string; asOf: string | null } | null;
}

export interface BriefingLine {
  text: string;
  /** Where the line came from, shown beside it. */
  source: string;
}

const clock = (at: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(at);

export function buildBriefing(input: BriefingInput): BriefingLine[] {
  const lines: BriefingLine[] = [];
  if (input.plan) {
    const next = input.plan.timeline.find((e) => e.kind !== 'wake' && e.startsAt.getTime() > input.now.getTime());
    if (next) lines.push({ text: `Next: ${next.label} at ${clock(next.startsAt, input.timezone)}.`, source: 'Your plan' });
  }
  if (input.train) {
    const asOf = input.train.asOf ? `, checked ${clock(new Date(input.train.asOf), input.timezone)}` : '';
    lines.push({ text: `${input.train.label} leaves at ${clock(input.train.departsAt, input.timezone)}, ${input.train.status.toLowerCase()}${asOf}.`, source: 'National Rail Enquiries (live)' });
  }
  lines.push({ text: 'Weather is not connected yet, so I cannot tell you about rain.', source: 'Weather' });
  return lines;
}

/** A single paragraph to read aloud. Each line keeps its own wording, so the source is never hidden. */
export function briefingSpeech(lines: BriefingLine[]): string {
  return lines.map((l) => l.text).join(' ');
}

export type { BoardDeparture };
