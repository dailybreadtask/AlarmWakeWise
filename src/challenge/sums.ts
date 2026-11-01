/** 0 easy, 1 medium, 2 hard. */
export type ChallengeLevel = 0 | 1 | 2;

export const LEVEL_NAMES = ['Easy', 'Medium', 'Hard'] as const;

/** A sum with four choices, one correct. Generated from a random source so tests can fix it. */
export interface Sum {
  question: string;
  answer: number;
  choices: number[];
}

export type Random = () => number;

const between = (rand: Random, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/**
 * A sum with three wrong choices close to the answer.
 * Easy: single digits added, like 4 + 7. Medium: two digits added or taken away, like 17 + 8. Hard: multiplication, like 14 × 6.
 */
export function makeSum(rand: Random, level: ChallengeLevel = 1): Sum {
  let question: string;
  let answer: number;
  if (level === 0) {
    const a = between(rand, 2, 9);
    const b = between(rand, 2, 9);
    question = `${a} + ${b}`;
    answer = a + b;
  } else if (level === 2) {
    const a = between(rand, 6, 14);
    const b = between(rand, 3, 9);
    question = `${a} × ${b}`;
    answer = a * b;
  } else {
    const a = between(rand, 11, 49);
    const b = between(rand, 3, 29);
    const adding = rand() < 0.5;
    answer = adding ? a + b : a - b;
    question = `${a} ${adding ? '+' : '−'} ${b}`;
  }

  const choices = new Set<number>([answer]);
  while (choices.size < 4) {
    const offset = between(rand, 1, 9) * (rand() < 0.5 ? -1 : 1);
    choices.add(answer + offset);
  }
  // Shuffle so the right answer is not always first.
  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { question, answer, choices: shuffled };
}

/** A seeded random source (mulberry32), so a test can reproduce a sum. */
export function seededRandom(seed: number): Random {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
