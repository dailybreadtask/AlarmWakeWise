/** A sum with four choices, one correct. Generated from a random source so tests can fix it. */
export interface Sum {
  question: string;
  answer: number;
  choices: number[];
}

export type Random = () => number;

const between = (rand: Random, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/** Two-digit sums: addition or subtraction, with three wrong choices close to the answer. */
export function makeSum(rand: Random): Sum {
  const a = between(rand, 11, 49);
  const b = between(rand, 3, 29);
  const adding = rand() < 0.5;
  const answer = adding ? a + b : a - b;
  const question = `${a} ${adding ? '+' : '−'} ${b}`;

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
