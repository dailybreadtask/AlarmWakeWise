import type { InterpretedDeadline } from './interpretation';
import { localToUtc } from './time';

export type ResolvedDeadline = { ok: true; at: Date } | { ok: false; question: string };

/**
 * Turns the reading's deadline into an instant. Relative times count from now.
 * Anything missing or unclear becomes a question. Nothing is guessed.
 */
export function resolveDeadline(deadline: InterpretedDeadline, timezone: string, now: Date): ResolvedDeadline {
  if (deadline.inMinutes !== null) return { ok: true, at: new Date(now.getTime() + deadline.inMinutes * 60_000) };

  const { date, time, dateWords } = deadline;
  if (!date) return { ok: false, question: dateWords ? `Which day do you mean by "${dateWords}"?` : 'Which day is this for?' };
  if (!time) return { ok: false, question: 'What time do you need to be there?' };

  const local = localToUtc(date, time, timezone);
  if (!local.ok) return { ok: false, question: 'That time is not clear for your clocks. What time do you mean?' };
  return { ok: true, at: local.at };
}
