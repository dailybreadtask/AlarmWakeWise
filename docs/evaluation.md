# Interpretation evaluation

Run on 2026-10-29 against OpenAI `gpt-4.1-mini`, reading requests as at Thursday 29 October 2026, 08:00, Europe/London.

Cases: `tests/eval/cases.json` (101, in 27 categories). Run: `npx tsx scripts/evalInterpret.ts`.

## Result

| Measure | Result |
| --- | --- |
| Fully correct | 96 / 101 |
| Valid reading (schema) | 100 / 101 |
| Intent matches | 99 / 101 |
| Time matches where stated | 59 / 63 |
| Invented times (must be 0) | **0** |
| Asks when required | 21 / 21 |
| Dates matched | 14 / 14 |
| Relative minutes matched | 4 / 4 |

## Rules these results test

- **A bare hour is never a silent guess.** A time with no a.m., p.m. or part-of-day word is assumed (morning for 5 to 11, evening for 1 to 4), and the reading marks it `timeAssumed`. The review screen tells the person which part of the day was assumed.
- **A time from another timezone is not converted.** The model is told to ask.
- **Durations are not clock times** ("for 2 hours").

These are enforced in code (`server/clockGuard.ts`), not left to the model.

## How the score moved

The first run scored 81 of 101 with 12 invented times. Changes made since:
- A rule in code for bare hours, and a stricter prompt (dates, timezones, empty goals).
- Label corrections. Several labels were wrong at first (for example "tonight" and "noon" have a time, and some cases asked for a question they did not need). Labels were corrected to match the spec, not to match the model.
- The assumed-time rule was changed from "evening for 1 to 5" to "morning for 5 to 11", after "wake me at 5:45" came back as 17:45.

The score is therefore sensitive to the labels and the rules. It is a measure of this set, not a general accuracy figure.

## Known limits

- **Evening meals at 6 or 7** are assumed to be morning (06:00 or 07:00). The assumption is marked and the person can change it, but this is a weak heuristic.
- **The remaining failures** are model variance: one reply was not valid, and a few intents or times differed. Examples are in the run output.
- **Labels are written by hand.** They reflect the spec, but they have not been checked by a second person.
- **Multi-run variance** has not been measured. One run is one sample.

## Decision recorded

On 2026-10-29 the product owner chose "assume and show" over "always ask" for bare hours. See `docs/design.md` for the screen behaviour.
