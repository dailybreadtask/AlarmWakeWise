/**
 * A typical journey time, the way a person would look it up. Server only.
 * Estimates are never presented as live. A result that fails the checks is
 * discarded, and the app asks the person instead.
 */
export const JOURNEY_MODES = ['bus', 'train', 'car', 'walk', 'cycle', 'taxi', 'other'] as const;
export type JourneyMode = (typeof JOURNEY_MODES)[number];

export interface EstimateRequest {
  from: string;
  to: string;
  mode: JourneyMode;
  /** Local time of day, HH:mm, if known. Traffic and timetables vary by time. */
  departAt: string | null;
}

export interface Estimate {
  minutesLow: number;
  minutesHigh: number;
  mode: JourneyMode;
  note: string;
  sources: string[];
}

export type EstimateOutcome = { ok: true; estimate: Estimate; cached: boolean } | { ok: false; error: 'unavailable' | 'invalid' | 'declined' };

export const ESTIMATE_MODEL = 'gpt-4.1-mini';
export const CACHE_MS = 24 * 60 * 60 * 1000;
export const RESPONSES_URL = 'https://api.openai.com/v1/responses';

const cache = new Map<string, { at: number; estimate: Estimate }>();

const key = (r: EstimateRequest) => `${r.from.trim().toLowerCase()}|${r.to.trim().toLowerCase()}|${r.mode}|${r.departAt ?? ''}`;

export const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['minutesLow', 'minutesHigh', 'note', 'sources'],
  properties: {
    minutesLow: { type: 'integer' },
    minutesHigh: { type: 'integer' },
    note: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * Pulls plain web addresses out of whatever the model wrote (sometimes a markdown
 * link), removes tracking parameters, and keeps at most three.
 */
export function cleanSources(raw: unknown[]): string[] {
  const found: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    for (const m of item.matchAll(/https?:\/\/[^\s)\]]+/g)) {
      const url = new URL(m[0]);
      url.search = '';
      if (!found.includes(url.toString())) found.push(url.toString());
    }
  }
  return found.slice(0, 3);
}

/** Checks the reply. A range outside a sensible journey, or a missing source, fails. */
export function checkEstimate(raw: unknown, mode: JourneyMode): Estimate | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const low = r.minutesLow;
  const high = r.minutesHigh;
  if (typeof low !== 'number' || typeof high !== 'number' || !Number.isInteger(low) || !Number.isInteger(high)) return null;
  if (low < 5 || high > 600 || high < low) return null;
  if (typeof r.note !== 'string' || r.note.length > 200) return null;
  if (!Array.isArray(r.sources)) return null;
  const sources = cleanSources(r.sources);
  if (sources.length === 0) return null;
  return { minutesLow: low, minutesHigh: high, mode, note: r.note, sources };
}

/** Asks the model, with web search, for a typical journey time. Cached for a day. */
export async function estimateJourney(req: EstimateRequest, options: { apiKey: string; fetchImpl?: typeof fetch; now?: () => number }): Promise<EstimateOutcome> {
  const { apiKey, fetchImpl = fetch, now = Date.now } = options;
  const cacheKey = key(req);
  const hit = cache.get(cacheKey);
  if (hit && now() - hit.at < CACHE_MS) return { ok: true, estimate: hit.estimate, cached: true };

  const prompt = [
    `Typical door-to-door journey time in the UK by ${req.mode} from "${req.from}" to "${req.to}"${req.departAt ? ` departing around ${req.departAt}` : ''}.`,
    'Search as a person would, for example "bus from X to Y how long". Give a low and a high estimate in whole minutes, a one-line note, and the web addresses you used.',
    'This is an estimate, not live data. Reply only with the JSON.',
  ].join(' ');

  let reply: Response;
  try {
    reply = await fetchImpl(RESPONSES_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ESTIMATE_MODEL,
        tools: [{ type: 'web_search' }],
        input: prompt,
        text: { format: { type: 'json_schema', name: 'journey_estimate', strict: true, schema: ESTIMATE_SCHEMA } },
      }),
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
  if (!reply.ok) return { ok: false, error: 'unavailable' };

  const payload = (await reply.json()) as { output_text?: string; output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[] };
  const text = payload.output_text ?? payload.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text;
  if (!text) return { ok: false, error: 'invalid' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  const estimate = checkEstimate(parsed, req.mode);
  if (!estimate) return { ok: false, error: 'invalid' };
  cache.set(cacheKey, { at: now(), estimate });
  return { ok: true, estimate, cached: false };
}
