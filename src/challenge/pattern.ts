import type { ChallengeLevel, Random } from './sums';

/** The grid is square, six dots a side. A cell is its index from 0 to 35, row by row. */
export const GRID = 6;

/** How many points to trace, and how long they are shown before they are hidden. Easy stays on screen. */
export const PATTERN_LEVELS: Record<ChallengeLevel, { points: number; showMs: number | null; hint: string }> = {
  0: { points: 4, showMs: null, hint: '4 points to trace' },
  1: { points: 5, showMs: 3000, hint: '5 points, shown once' },
  2: { points: 7, showMs: 3500, hint: '7 points, no replay' },
};

/** Distinct cells in the order they must be tapped. */
export function makePattern(rand: Random, level: ChallengeLevel): number[] {
  const cells = new Set<number>();
  while (cells.size < PATTERN_LEVELS[level].points) cells.add(Math.floor(rand() * GRID * GRID));
  return [...cells];
}
