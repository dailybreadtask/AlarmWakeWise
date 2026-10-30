import type { PlanFeedback } from './planRepository';

/** How many answers are needed before a pattern is worth suggesting. */
export const MIN_ANSWERS = 3;
export const STEP_MINUTES = 5;

/**
 * A suggested change to the time to get ready, from the person's own answers.
 * It is only a suggestion. It never changes the default without the person's say.
 */
export function suggestGetReady(feedback: PlanFeedback[], current: number): { minutes: number; reason: string } | null {
  if (feedback.length < MIN_ANSWERS) return null;
  const count = (p: PlanFeedback['prep']) => feedback.filter((f) => f.prep === p).length;
  const more = count('more');
  const less = count('less');
  const majority = (n: number) => n > feedback.length / 2;
  if (majority(more)) return { minutes: current + STEP_MINUTES, reason: `You needed more time to get ready in ${more} of ${feedback.length} plans.` };
  if (majority(less)) return { minutes: Math.max(0, current - STEP_MINUTES), reason: `You needed less time to get ready in ${less} of ${feedback.length} plans.` };
  return null;
}
