import { CAPABILITY_IDS, type CapabilityId } from './capability';

/**
 * The versioned shape the model must return. Anything outside it is rejected
 * whole. The model proposes; deterministic code checks the result and decides.
 */
export const INTERPRETATION_VERSION = 3;

export const INTENT_TYPES = ['purpose_alarm', 'quick_alarm', 'timer', 'reminder', 'unsupported'] as const;
export type IntentType = (typeof INTENT_TYPES)[number];

export const PARAM_KEYS = ['place', 'from', 'to', 'flight', 'message', 'minutes'] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];

export const QUESTION_FIELDS = ['deadline', 'place', 'from', 'to', 'message', 'minutes', 'flight', 'other'] as const;
export type QuestionField = (typeof QUESTION_FIELDS)[number];

/** Below this, the request needs at least one question before any plan is shown. */
export const CLARIFY_BELOW_CONFIDENCE = 0.6;
export const MAX_COMMITMENTS = 3;
export const MAX_REQUESTS = 6;
export const MAX_QUESTIONS = 3;
/** A relative time such as "in 90 minutes" is at most one week ahead. */
export const MAX_RELATIVE_MINUTES = 7 * 24 * 60;

export interface InterpretedDeadline {
  /** Local calendar date, YYYY-MM-DD, or null when the person did not give a usable one. */
  date: string | null;
  /** Local time, HH:mm (24h), or null. Never guessed by the model. */
  time: string | null;
  /** The person's words for the date, kept for display, e.g. "next Sunday". */
  dateWords: string | null;
  /** For "in 90 minutes": minutes from now, resolved on the device. Null otherwise. */
  inMinutes: number | null;
  /** True when the time had no morning or evening and the app chose one. The person must be able to change it. */
  timeAssumed: boolean;
}

export interface InterpretedCommitment {
  outcome: string;
  deadline: InterpretedDeadline;
  /** Saved place label, e.g. "work". Never an address. */
  placeLabel: string | null;
}

export interface InterpretedRequest {
  capability: CapabilityId;
  reason: string;
  params: Partial<Record<ParamKey, string | number>>;
}

export interface InterpretedQuestion {
  field: QuestionField;
  question: string;
}

export interface Interpretation {
  schemaVersion: typeof INTERPRETATION_VERSION;
  goal: string;
  intentType: IntentType;
  confidence: number;
  commitments: InterpretedCommitment[];
  requests: InterpretedRequest[];
  questions: InterpretedQuestion[];
}

export type ValidationResult = { ok: true; value: Interpretation } | { ok: false; errors: string[] };

const TOP_KEYS = ['schemaVersion', 'goal', 'intentType', 'confidence', 'commitments', 'requests', 'questions'];
const COMMITMENT_KEYS = ['outcome', 'deadline', 'placeLabel'];
const DEADLINE_KEYS = ['date', 'time', 'dateWords', 'inMinutes', 'timeAssumed'];
const REQUEST_KEYS = ['capability', 'reason', 'params'];
const QUESTION_KEYS = ['field', 'question'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const nullableString = (v: unknown, max: number) => v === null || isString(v, max);

function unknownKeys(obj: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

/** A real calendar date, not just a matching shape: rejects 2026-02-30. */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isRealTime(value: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match !== null;
}

function checkDeadline(value: unknown, path: string, errors: string[]) {
  if (!isObject(value)) return errors.push(`${path} must be an object`);
  unknownKeys(value, DEADLINE_KEYS).forEach((k) => errors.push(`${path} has unknown field ${k}`));
  if (value.date !== null && (typeof value.date !== 'string' || !isRealDate(value.date))) errors.push(`${path}.date must be YYYY-MM-DD or null`);
  if (value.time !== null && (typeof value.time !== 'string' || !isRealTime(value.time))) errors.push(`${path}.time must be HH:mm or null`);
  if (!nullableString(value.dateWords, 60)) errors.push(`${path}.dateWords must be a short string or null`);
  if (typeof value.timeAssumed !== 'boolean') errors.push(`${path}.timeAssumed must be true or false`);
  const inMinutes = value.inMinutes;
  if (inMinutes !== null && (typeof inMinutes !== 'number' || !Number.isInteger(inMinutes) || inMinutes < 1 || inMinutes > MAX_RELATIVE_MINUTES)) {
    errors.push(`${path}.inMinutes must be a whole number of minutes up to one week, or null`);
  }
}

function checkRequest(value: unknown, path: string, errors: string[]) {
  if (!isObject(value)) return errors.push(`${path} must be an object`);
  unknownKeys(value, REQUEST_KEYS).forEach((k) => errors.push(`${path} has unknown field ${k}`));
  if (typeof value.capability !== 'string' || !(CAPABILITY_IDS as readonly string[]).includes(value.capability)) {
    errors.push(`${path}.capability is not a supported capability`);
  }
  if (!isString(value.reason, 140)) errors.push(`${path}.reason must be a short string`);
  if (!isObject(value.params)) return errors.push(`${path}.params must be an object`);
  for (const [key, param] of Object.entries(value.params)) {
    if (!(PARAM_KEYS as readonly string[]).includes(key)) errors.push(`${path}.params has unknown key ${key}`);
    else if (!(typeof param === 'string' ? param.length <= 80 : typeof param === 'number' && Number.isFinite(param))) {
      errors.push(`${path}.params.${key} has the wrong type`);
    }
  }
}

/**
 * Checks a model reply against the schema. Fails closed: any unknown field,
 * capability, or out-of-range value rejects the whole reply, and the caller
 * falls back to asking the person.
 */
export function validateInterpretation(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['reply must be an object'] };
  unknownKeys(raw, TOP_KEYS).forEach((k) => errors.push(`unknown field ${k}`));

  if (raw.schemaVersion !== INTERPRETATION_VERSION) errors.push('schemaVersion is not supported');
  if (!isString(raw.goal, 200) || raw.goal.trim() === '') errors.push('goal must be a non-empty short string');
  if (!(INTENT_TYPES as readonly unknown[]).includes(raw.intentType)) errors.push('intentType is not supported');
  if (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 1) errors.push('confidence must be between 0 and 1');

  if (!Array.isArray(raw.commitments) || raw.commitments.length > MAX_COMMITMENTS) errors.push(`commitments must be a list of at most ${MAX_COMMITMENTS}`);
  else
    raw.commitments.forEach((c, i) => {
      if (!isObject(c)) return errors.push(`commitments[${i}] must be an object`);
      unknownKeys(c, COMMITMENT_KEYS).forEach((k) => errors.push(`commitments[${i}] has unknown field ${k}`));
      if (!isString(c.outcome, 140) || c.outcome.trim() === '') errors.push(`commitments[${i}].outcome must be a short string`);
      if (!nullableString(c.placeLabel, 30)) errors.push(`commitments[${i}].placeLabel must be a short label or null`);
      checkDeadline(c.deadline, `commitments[${i}].deadline`, errors);
    });

  if (!Array.isArray(raw.requests) || raw.requests.length > MAX_REQUESTS) errors.push(`requests must be a list of at most ${MAX_REQUESTS}`);
  else raw.requests.forEach((r, i) => checkRequest(r, `requests[${i}]`, errors));

  if (!Array.isArray(raw.questions) || raw.questions.length > MAX_QUESTIONS) errors.push(`questions must be a list of at most ${MAX_QUESTIONS}`);
  else
    raw.questions.forEach((q, i) => {
      if (!isObject(q)) return errors.push(`questions[${i}] must be an object`);
      unknownKeys(q, QUESTION_KEYS).forEach((k) => errors.push(`questions[${i}] has unknown field ${k}`));
      if (!(QUESTION_FIELDS as readonly unknown[]).includes(q.field)) errors.push(`questions[${i}].field is not supported`);
      if (!isString(q.question, 160) || q.question.trim() === '') errors.push(`questions[${i}].question must be a short string`);
    });

  if (errors.length === 0) {
    const questions = raw.questions as unknown[];
    if (typeof raw.confidence === 'number' && raw.confidence < CLARIFY_BELOW_CONFIDENCE && raw.intentType !== 'unsupported' && questions.length === 0) {
      errors.push('low confidence needs at least one question');
    }
  }

  return errors.length === 0 ? { ok: true, value: raw as unknown as Interpretation } : { ok: false, errors };
}
