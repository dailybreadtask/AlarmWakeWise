import { CAPABILITY_IDS } from '../src/domain/capability';
import { guardClockTimes } from './clockGuard';
import { INTENT_TYPES, INTERPRETATION_VERSION, PARAM_KEYS, QUESTION_FIELDS, validateInterpretation, type ValidationResult } from '../src/domain/interpretation';

/**
 * Reads a request with OpenAI and returns only what passes the schema
 * validator. The model proposes; the app decides. Server only: the key stays here.
 */
export const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
/** Non-reasoning model with strict JSON schema output. Cheapest current option that handles ambiguity well. */
export const DEFAULT_INTERPRET_MODEL = 'gpt-4.1-mini';
export const MAX_TEXT_CHARS = 500;

const str = { type: 'string' };
const nullableStr = { type: ['string', 'null'] };

/** Strict-mode JSON schema: every object lists all its properties and forbids extras. */
export const INTERPRETATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'goal', 'intentType', 'confidence', 'commitments', 'requests', 'questions'],
  properties: {
    schemaVersion: { type: 'integer', enum: [INTERPRETATION_VERSION] },
    goal: str,
    intentType: { type: 'string', enum: [...INTENT_TYPES] },
    confidence: { type: 'number' },
    commitments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['outcome', 'deadline', 'placeLabel'],
        properties: {
          outcome: str,
          deadline: {
            type: 'object',
            additionalProperties: false,
            required: ['date', 'time', 'dateWords', 'inMinutes', 'timeAssumed'],
            properties: { date: nullableStr, time: nullableStr, dateWords: nullableStr, inMinutes: { type: ['integer', 'null'] }, timeAssumed: { type: 'boolean' } },
          },
          placeLabel: nullableStr,
        },
      },
    },
    requests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'reason', 'params'],
        properties: {
          capability: { type: 'string', enum: [...CAPABILITY_IDS] },
          reason: str,
          params: {
            type: 'object',
            additionalProperties: false,
            required: [...PARAM_KEYS],
            properties: Object.fromEntries(PARAM_KEYS.map((k) => [k, k === 'minutes' ? { type: ['number', 'null'] } : nullableStr])),
          },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'question'],
        properties: { field: { type: 'string', enum: [...QUESTION_FIELDS] }, question: str },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You read one short request from a person who wants help getting ready for something, for example an alarm with a purpose.

Rules you must follow:
- Return only the JSON object in the requested schema.
- Never invent a time, date, place or deadline. If the person did not say it, use null.
- Use "time" as 24-hour HH:mm in the person's timezone, only when they stated a time.
- Use "date" as YYYY-MM-DD only when you can work it out exactly from the current date you are given. Otherwise null, and put the person's words in "dateWords".
- For a relative time such as "in 90 minutes" or "in 2 hours", set "inMinutes" to the whole number of minutes from now and leave date and time null. Never work out a clock time for it yourself.
- Use intentType "quick_alarm" when the person only wants an alarm at a time, with no goal to prepare for. Use "purpose_alarm" when there is something to get ready for.
- Only request capabilities from the enum. If the person asks for something outside it, set intentType to "unsupported" and explain nothing else.
- Put a question in "questions" for each essential detail that is missing, one question per detail, at most three.
- Set confidence between 0 and 1. Use a low value when the request is unclear.
- Do not include personal data the person did not give you.
- If a clock time has no a.m. or p.m. and no 24-hour form, give your best time and set "timeAssumed" to true. Otherwise set "timeAssumed" to false.
- When the person gives a day and month, such as "26 October", set "date" to YYYY-MM-DD using the current date you are given.
- If the person gives a day but no time for something they must do at a time, ask for the time.
- For a journey by train or bus, if the departure or destination station is missing, ask which station they leave from and which they travel to. Never ask whether the alarm should be set for a station.
- When the person says how they travel, add a request: capability "transit" for a bus, tram or tube; "rail" for a train; "road" for a car or driving; params "from" is where they start and "to" is where they go. Use the place names as the person said them. Use "rail" only for trains.
- Whenever the person gives both a start and a destination, record them in the "from" and "to" params of a request, even if the way of travelling is not stated. Use capability "alarm" in that case.
- Never convert a time from another timezone. If the person names a timezone other than the one given, use null for the time and ask.
- Never answer with an empty goal. For small talk or unclear input, set "goal" to the person's words and "intentType" to "unsupported".`;

export function buildUserMessage(input: { text: string; places: { label: string; area?: string }[]; nowIso: string; timezone: string }): string {
  const places = input.places.length > 0 ? input.places.map((p) => (p.area ? `${p.label} (${p.area})` : p.label)).join(', ') : 'none saved';
  return [`Current date and time (UTC): ${input.nowIso}`, `Person's timezone: ${input.timezone}`, `Saved places: ${places}`, '', `Request: ${input.text}`].join('\n');
}

export type InterpretError = 'provider_failed' | 'provider_timeout' | 'bad_model_output' | 'declined';

export type InterpretOutcome = { ok: true; value: NonNullable<Extract<ValidationResult, { ok: true }>['value']> } | { ok: false; error: InterpretError };

export interface InterpretOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Strict mode returns null for absent params. The validator takes them as absent, so drop them first. */
function dropNullParams(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const copy = structuredClone(raw) as { requests?: { params?: Record<string, unknown> }[] };
  for (const request of copy.requests ?? []) {
    if (!request.params) continue;
    for (const [key, value] of Object.entries(request.params)) if (value === null) delete request.params[key];
  }
  return copy;
}

export async function interpretRequest(input: { text: string; places: { label: string; area?: string }[]; nowIso: string; timezone: string }, options: InterpretOptions): Promise<InterpretOutcome> {
  const { apiKey, model = DEFAULT_INTERPRET_MODEL, fetchImpl = fetch, timeoutMs = 20_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(CHAT_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(input) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'wakewise_interpretation', strict: true, schema: INTERPRETATION_JSON_SCHEMA } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: 'provider_failed' };
    const payload = (await response.json()) as { choices?: { message?: { content?: string; refusal?: string | null } }[] };
    const message = payload.choices?.[0]?.message;
    if (!message) return { ok: false, error: 'provider_failed' };
    if (message.refusal) return { ok: false, error: 'declined' };
    if (typeof message.content !== 'string') return { ok: false, error: 'bad_model_output' };
    const checked = validateInterpretation(dropNullParams(JSON.parse(message.content)));
    return checked.ok ? { ok: true, value: guardClockTimes(input.text, checked.value) } : { ok: false, error: 'bad_model_output' };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'provider_timeout' : 'provider_failed' };
  } finally {
    clearTimeout(timer);
  }
}
