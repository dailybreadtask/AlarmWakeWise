/**
 * Runs the labelled request set through the same interpretation path the
 * server uses, and reports how often the reading matches the labels.
 * Usage: npx tsx scripts/evalInterpret.ts [limit]
 * Reads OPENAI_API_KEY from server/.env.local. Prints summaries only, never keys.
 */
import { readFileSync } from 'node:fs';
import { assumedClocks } from '../server/clockGuard';
import { interpretRequest } from '../server/interpret';

interface Case {
  category: string;
  text: string;
  intents: string[];
  time: string | null;
  date: string | null;
  inMinutes: number | null;
  ask: boolean | null;
  note: string;
}

const NOW = '2026-10-29T08:00:00Z';
const TZ = 'Europe/London';
const env = readFileSync('server/.env.local', 'utf8');
const apiKey = (env.match(/^OPENAI_API_KEY=(.*)$/m) ?? [, ''])[1].trim();
const cases: Case[] = JSON.parse(readFileSync('tests/eval/cases.json', 'utf8'));
const limit = Number(process.argv[2] ?? cases.length);

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

interface Result {
  c: Case;
  schemaOk: boolean;
  intentOk: boolean;
  inventedTime: boolean;
  timeOk: boolean | null;
  dateOk: boolean | null;
  inMinutesOk: boolean | null;
  askOk: boolean | null;
  failures: string[];
}

async function check(c: Case): Promise<Result> {
  const outcome = await interpretRequest({ text: c.text, places: [], nowIso: NOW, timezone: TZ }, { apiKey });
  const failures: string[] = [];
  if (!outcome.ok) {
    failures.push(`no valid reading (${outcome.error})`);
    return { c, schemaOk: false, intentOk: false, inventedTime: false, timeOk: null, dateOk: null, inMinutesOk: null, askOk: null, failures };
  }
  const v = outcome.value;
  const deadline = v.commitments[0]?.deadline;
  const intentOk = c.intents.includes(v.intentType);
  if (!intentOk) failures.push(`intent ${v.intentType}, expected one of ${c.intents.join('/')}`);

  // An invented time: a clock time given when the person stated none.
  const inventedTime = c.time === null && assumedClocks(c.text).length === 0 && v.commitments.some((x) => x.deadline.time !== null);
  if (inventedTime) failures.push(`invented time ${v.commitments.map((x) => x.deadline.time).join(',')}`);

  // A bare hour is an assumption: the time must be the rule's time, and marked as assumed.
  const noAssumption = ['unsupported', 'impossible', 'chat', 'unclear', 'timezone', 'safety'].includes(c.category);
  const assumed = c.time === null && !noAssumption ? assumedClocks(c.text)[0] ?? null : null;
  if (assumed) {
    const hit = v.commitments.find((x) => x.deadline.time === assumed);
    if (!hit) failures.push(`assumed time ${assumed} not used (got ${deadline?.time ?? 'none'})`);
    else if (!hit.deadline.timeAssumed) failures.push('time not marked as assumed');
  }
  const timeOk = c.time === null ? (assumed ? v.commitments.some((x) => x.deadline.time === assumed) : null) : v.commitments.some((x) => x.deadline.time === c.time);
  if (timeOk === false && !assumed) failures.push(`time ${deadline?.time ?? 'none'}, expected ${c.time}`);

  const dateOk = c.date === null ? null : v.commitments.some((x) => x.deadline.date === c.date);
  if (dateOk === false) failures.push(`date ${deadline?.date ?? 'none'}, expected ${c.date}`);

  const inMinutesOk = c.inMinutes === null ? null : v.commitments.some((x) => x.deadline.inMinutes === c.inMinutes);
  if (inMinutesOk === false) failures.push(`inMinutes expected ${c.inMinutes}`);

  let askOk: boolean | null = null;
  if (c.ask !== null && !assumed) {
    const asks = v.questions.length > 0 || v.intentType === 'unsupported';
    askOk = c.ask ? asks : true;
    if (!askOk) failures.push('should ask a question before planning');
  }
  return { c, schemaOk: true, intentOk, inventedTime, timeOk, dateOk, inMinutesOk, askOk, failures };
}

(async () => {
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing from server/.env.local');
  const run = cases.slice(0, limit);
  const results = await pool(run, 4, check);

  const passed = results.filter((r) => r.failures.length === 0).length;
  const rate = (f: (r: Result) => boolean | null) => {
    const applicable = results.filter((r) => f(r) !== null);
    return `${applicable.filter((r) => f(r) === true).length}/${applicable.length}`;
  };
  console.log(`cases run: ${results.length}`);
  console.log(`fully correct: ${passed}/${results.length}`);
  console.log(`valid reading (schema): ${results.filter((r) => r.schemaOk).length}/${results.length}`);
  console.log(`intent matches: ${results.filter((r) => r.intentOk).length}/${results.length}`);
  console.log(`time matches (where stated): ${rate((r) => r.timeOk)}`);
  console.log(`date matches (where stated): ${rate((r) => r.dateOk)}`);
  console.log(`relative minutes match: ${rate((r) => r.inMinutesOk)}`);
  console.log(`asks when required: ${rate((r) => r.askOk)}`);
  console.log(`INVENTED TIMES: ${results.filter((r) => r.inventedTime).length} (must be 0)`);

  const byCat = new Map<string, { ok: number; n: number }>();
  for (const r of results) {
    const e = byCat.get(r.c.category) ?? { ok: 0, n: 0 };
    e.n += 1;
    if (r.failures.length === 0) e.ok += 1;
    byCat.set(r.c.category, e);
  }
  console.log('\nby category:');
  for (const [cat, e] of byCat) console.log(`  ${cat.padEnd(16)} ${e.ok}/${e.n}`);

  const failing = results.filter((r) => r.failures.length > 0);
  console.log(`\nfailing cases: ${failing.length}`);
  for (const r of failing) console.log(`  [${r.c.category}] "${r.c.text}" -> ${r.failures.join('; ')}`);
})().catch((e) => {
  console.log('eval error:', e.message);
  process.exit(1);
});
