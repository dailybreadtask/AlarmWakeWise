# WakeWise v3.0 architecture

Source of truth: `concepts/WakeWise_Product_and_Technical_Specification_v3.0.docx` and `concepts/WakeWise_Code_Agent_Master_Prompt_v3.0.md`. This file records the decisions needed before feature code. Where it disagrees with the spec, the spec wins and this file is updated.

## 1. Layers

```
UI (src/app, src/components)           Expo Router screens. No business rules.
  |
Use cases (src/services)               Orchestrate domain + adapters. Pure where possible.
  |
Domain (src/domain)                    Entities, state machines, validation. No I/O.
  |
Adapters (src/adapters)                Native alarms, storage, AI client, provider clients.
  |                                    Each sits behind an interface defined in domain.
Native modules (modules/)              AlarmKit (iOS). Android alarm adapter later.
Server (server/)                       AI reader, provider proxy, monitors. Holds all keys.
```

Rules:

- Domain code imports nothing from `expo-*`, `react-native`, or `fetch`.
- The UI never calls a provider or the AI service directly. It goes through a service.
- Every adapter has a mock implementation used by tests and by flags. A mock never reports itself as live.

## 2. Architecture decision records

### ADR-001: Expo SDK 57, Expo Router, npm

Status: accepted. The v3 spec does not name a version. The archived project used SDK 57 and its native build was verified against it. SDK 58 exists; moving is a separate decision. Routes live in `src/app/` (AGENTS.md). Package manager is npm, as in the archived project.

### ADR-002: Native alarms are isolated from AI, network and monitoring

Status: accepted (spec §2, §11). Scheduling an alarm needs only the local store and the native module. Nothing in the scheduling path imports the AI client, a provider adapter, or the monitor. A failed AI call, a provider outage or a missing network never changes a scheduled alarm.

### ADR-003: AI proposes, deterministic code decides

Status: accepted (master prompt). The model returns a versioned, schema-constrained object. The server validates it, and the device validates it again. Only a validated plan can reach the scheduler, and only after the person confirms it. The model cannot call a native API, cannot fetch live data, and cannot invent times, places or deadlines.

### ADR-004: Closed capability registry

Status: accepted (spec §6). Capabilities are a fixed, typed list. The model may request only ids in the list. Unknown ids fail closed. A new purpose is a composition of existing capabilities, not a new handler. Each capability declares its inputs, outputs, permission scope, freshness rule and error states.

### ADR-005: Data minimisation for AI and providers

Status: accepted (spec §11). External services receive the request text, saved-place labels, and coarse areas only. They never receive coordinates, street addresses or calendar contents unless the person has granted that scope and the data is needed for that request. Analytics and logs record event names and counts, never request text.

### ADR-006: Monitoring is only claimed when active

Status: accepted (spec §8, AC13). A monitor has an explicit start, stop, cadence and expiry. The UI shows "monitoring" only when the monitor state is `active` and its last successful check is within the freshness threshold. Background push and background execution are not assumed to be reliable.

### ADR-007: Committed alarms change only by consent and verified rescheduling

Status: accepted (spec §8, AC12). A change proposal never moves an alarm by itself. It becomes a change only when the person accepts it, or when a policy the person has explicitly set allows it. The change counts as done only after the native scheduler confirms success. Until then the original alarm stays in place.

### ADR-008: Versioned local storage

Status: accepted. SQLite (`expo-sqlite`), with a schema version recorded in `PRAGMA user_version` and forward-only migrations. Migrations are pure functions with tests. The database name is `wakewise.db`.

### ADR-010: Interpretation through OpenAI, on the server

Status: accepted. `server/interpret.ts` sends the request text, the current time, the person's timezone and saved place labels to OpenAI `gpt-4.1-mini` (temperature 0, strict `json_schema`). The reply is checked by `validateInterpretation` on the server and again on the phone. Nothing unvalidated is shown. `gpt-4.1-mini` is $0.40 / $1.60 per million tokens. `gpt-4.1-nano` is cheaper but not used until an evaluation set shows it is accurate enough.

### ADR-009: Speech to text through OpenAI, on the server

Status: accepted. The phone records with `expo-audio` (`src/speech/useVoiceCapture.ts`) and uploads the clip to the WakeWise server (`POST /speech/transcribe`). The server calls OpenAI's transcription endpoint with the key from `server/.env.local`, and the key never reaches the phone. Audio is not stored on the server. Model: `gpt-transcribe`, OpenAI's recommended transcription model at $0.0045 per minute (checked against developers.openai.com on 2026-10-29). `gpt-4o-mini-transcribe` is cheaper at $0.003 per minute but is listed for shutdown on 2027-02-26, so it is not used. Speech is sent only after the person allows the `speech` scope; the client refuses to upload without it. Typed entry remains the fallback.

## 3. Entities

Shared types are in `src/domain/`. Times are UTC instants (ISO 8601). Local times carry an IANA timezone.

| Entity | File | Purpose |
| --- | --- | --- |
| Intent | `intent.ts` | What the person said or typed, and its interpretation status. |
| Commitment | `commitment.ts` | The outcome, deadline, place and recurrence. |
| ContextFact | `context.ts` | One piece of information with source, consent, status and expiry. |
| Capability | `capability.ts` | Contract for a capability: inputs, result, freshness, errors. |
| Plan | `plan.ts` | Ordered steps worked back from the commitment, with assumptions. |
| Action | `action.ts` | One thing to schedule: alarm, timer, reminder, task or notification. |
| Monitor | `monitor.ts` | A bounded watch on one fact or provider. |
| ChangeProposal | `proposal.ts` | A proposed change to a plan, with alternatives and the person's decision. |
| Feedback | `feedback.ts` | Whether the person did the thing, and how the timing felt. |

## 4. State machines

Each machine is a transition table in `src/domain/machines.ts`. Any event not in the table is rejected and the state stays put. Tests cover every table.

### Intent

```
captured --interpret_ok--> interpreted --needs_answer--> clarifying --answer--> interpreted
interpreted --plan_ready--> planned --confirm--> confirmed
planned --edit--> planned
any open state --discard--> discarded
```

### Plan

```
draft --propose--> proposed --approve--> approved --supersede--> superseded
proposed --edit--> draft
approved --change_proposed--> proposed(v+1)   (the approved version stays in effect)
```

### Action (native schedule)

```
proposed --approve--> approved --schedule_request--> scheduling
scheduling --os_confirmed--> scheduled
scheduling --os_failed--> failed
scheduled --fire--> fired
scheduled --cancel--> cancelled
failed --retry--> scheduling
```

`scheduling` uses an idempotency key derived from the plan id, version and action id, so a retry never creates a second alarm.

### Monitor

```
inactive --start--> active
active --check_ok--> active            (lastCheckAt, lastObservedAt updated)
active --check_failed--> degraded
degraded --check_ok--> active
active|degraded --expire--> expired
active|degraded --stop--> stopped
```

The UI reads `active` as "monitoring". `degraded` and `expired` are shown as not monitoring.

### ChangeProposal

```
pending --accept--> accepted --apply_ok--> applied
                  --apply_failed--> pending   (the original stays in effect)
pending --decline--> declined
pending --expire--> expired
```

## 5. Capability contract

Every capability implements the same shape (`src/domain/capability.ts`):

- `id`: one of the closed list.
- `inputs`: typed and validated before any call.
- `permission`: the consent scope it needs, or `none`.
- `external`: whether it sends anything to a third party.
- `invoke(input)`: returns `{ ok: true, facts, asOf, source }` or `{ ok: false, error }`. Error kinds: `unavailable`, `timeout`, `stale`, `not_found`, `permission_denied`, `invalid_input`.
- `freshness`: maximum age in seconds before a fact is shown as stale.

Mock providers implement the same contract and return `source: 'mock'`. The UI labels mock facts as synthetic.

## 6. Native alarm architecture

- One Swift module (`modules/wakewise-alarm`) owns AlarmKit. The TypeScript side talks to it only through `AlarmScheduler`.
- `AlarmScheduler` methods: `authorize`, `schedule(action)`, `cancel(id)`, `list()`, `reconcile(expected)`.
- Reconcile runs on launch and on foreground. It removes native alarms that no stored action expects, and reschedules any action the OS lost.
- Every schedule call carries an idempotency key. The scheduler reports success only from the OS response.
- Limits that the OS does not expose (volume ramp, vibration control, snooze limit) are shown as "not applied" or hidden.

## 7. Provider contracts (not yet built)

Each provider adapter has a server-side client and a mock. Nothing is called from the device.

| Capability | Provider | Status |
| --- | --- | --- |
| Rail departures | National Rail Darwin | Not chosen for build. Credentials needed. |
| London line status | TfL | Not chosen for build. Key needed. |
| Weather | Not chosen | Blocked on choice. |
| Road traffic and roadworks | Not chosen | Blocked on choice. |
| Flight status | Licensed provider | Blocked on licence. |
| Calendar | Device calendar | Needs an Expo v57 check before use. |

## 7b. Rail (live departures)

- **Source:** the Darwin Push Port (STOMP, topic `darwin.pushport-v16`). Credentials come from the My Feeds page; they live in `server/.env.local` only.
- **Server:** `server/darwinListener.ts` keeps the connection open. `server/darwinFeed.ts` reads schedules (full route) and forecasts (estimates) and merges them. Times are trimmed to minutes.
- **Station codes:** the reference data in `server/data/` maps passenger codes (CRS) to feed codes (TIPLOC) and names. It is licensed, so it is git-ignored.
- **Routes:** `GET /rail/departures?from=&to=` and `GET /rail/stations?q=`. Both need the app token.
- **Plan:** `src/rail/RailPlan.tsx` takes the latest train that reaches the destination before the deadline, and works back from its departure. Estimates for walking and getting ready are labelled. Cancelled and delayed trains are skipped rather than guessed.
- **Attribution and freshness:** the plan shows "Powered by National Rail Enquiries" and the as-of time of the last feed message. Platforms the feed marks as suppressed are hidden.
- **Known limits:** the board is only as current as the feed. A train with no route data, or with a delay that gives no clock time, is not used.

## 7c. Saved alarms (on the phone)

- **Table:** `alarm` in `wakewise.db`, created at startup (`src/storage/alarmRepository.ts`). Each row keeps the native alarm id, the wake time, the source ("quick" or "plan") and a status.
- **When saved:** after the OS accepts an alarm. A failure to save never undoes the alarm.
- **Reconcile:** on home-screen load, saved "scheduled" alarms that iOS no longer holds become "missing". Nothing is rescheduled or moved. The check runs only where the alarm module is available, so Expo Go cannot mark everything missing.
- **Shown:** the next upcoming alarm on home, with its status.

## 7d. Personal context (backlog 05)

- **On the phone:** saved places (home, work, station, other) and planning preferences (time to get ready, spare time, never wake before). Stored in `place` and `preference` tables (`src/context/contextRepository.ts`).
- **Shown and changed in:** Your context (home screen link). Every place can be deleted; everything can be deleted at once. Saved alarms are kept, since iOS holds them.
- **Sent to the AI:** place names and areas only, with the consent that already covers reading requests. Never addresses or coordinates (ADR-005).
- **Used by:** the review screen (defaults and the never-wake-before limit), train plans (a saved station name resolves without a search), and the reading request.

## 7e. Timers (cooking and study)

- **Record:** `timer` table (label, end time, notification id, status), in `src/timers/`.
- **End:** an AlarmKit alarm at the end time when AlarmKit is authorised, so it rings like the wake alarm. Otherwise a notification, which iOS can silence in Focus.
- **Why not AlarmKit's timer API:** it starts counting at once, so it cannot begin at a planned time. An alarm at the end time works for both immediate and planned timers.
- **Limits:** an alarm can only be set within the next 24 hours. Timer alarms are not in the saved-alarm record, so the missing-alarm check does not cover them. Both still need a device test.
- **Screen:** Timers (home link): a name, preset lengths, running timers with end times, and cancel.

## 7f. Plans and feedback (backlog 15)

- **Saved plan:** recorded when the plan's wake alarm is set (`plan_record`). Holds the goal, event time, wake time and the get-ready time used. Its steps are kept in `plan_timeline`, so the briefing can name the next one.
- **Feedback:** after the event time, the home screen asks how it went: on time, late or missed, and whether the time to get ready was right. Answers are stored in `plan_feedback`.
- **Suggestions:** after at least three answers, if most say the time to get ready was too little or too much, the app offers to change the default by 5 minutes. It changes nothing unless the person says yes.
- **Not done:** using feedback for other estimates such as journey time, and any opt-in for learning across plans.

## 7g. Train journeys: check and adjust (backlog 11-13, partial)

- **Saved with the plan:** the route, the chosen train, the deadline, the wake alarm's OS id and the limits (`plan_journey`).
- **Checked against the live board** (`src/journey/journeyCheck.ts`): on time, delayed but still fine, at risk, cancelled, or not on the board. The check never guesses. Missing data is reported as missing.
- **Proposals only:** a later train that still gets you there, with the wake time it needs. Never earlier than your "never wake me before" time.
- **Changing the alarm** (`src/journey/moveWakeAlarm.ts`): the new alarm is set and confirmed first, then the old one is cancelled. If the new one fails, the old stays. The record of the old alarm is marked cancelled only after the old one is cancelled.
- **When it checks:** when the home screen opens. Background checks need the server to push notifications (Railway step), since iOS does not allow reliable background polling.
- **Not yet:** the moved alarm uses the system tone (the chosen tone is not saved per alarm); the plan's wake time is not updated after a move (the journey record holds the new time); no standing approval policy.

## 7h. Typical journey times (buses, cars, walking)

- **Server:** `POST /journey/estimate`. Buses, walking and other modes: a typical time from a web search, checked against a strict schema, with sources, cached for a day. Driving: TomTom routing with live traffic (`TOMTOM_API_KEY`, server only), with a small range around the result.
- **App:** a bus, car or other journey gets a plan built on the typical time, labelled as an estimate with its sources. A journey with no way of travelling gets one polite question: "How will you travel: bus, train, car, or on foot?"
- **Trains** keep the live timetable.
- **Known gap:** a request that gives a start and destination without saying how the person travels is not always captured by the reading yet.

## 8. Build order

Follows the spec §12 backlog and the master prompt's dependency order.

1. Foundation: Expo SDK 57 project, routes, lint, typecheck, dependency checks. Done.
2. Domain contracts and state machines: entities, transitions, monitoring and alarm-change rules. Done, 17 tests.
3. Structured interpretation schema: versioned, fail-closed validator. Done, 12 tests. Time is never invented.
4. Native alarm: AlarmKit module compiled and a quick alarm rang on an iPhone 15 Pro (iOS 26.6.2). Locked, force-quit and the other cases in `docs/device-evidence.md` are still to test. The plan's wake alarm can be approved and set.
5. Speech to text: server endpoint, client and recording hook. Done, 39 tests; device recording not yet tested.
6. Speech consent and capture screens. Done: consent is off by default and persisted in SQLite (`consent_scope`), and the capture screen falls back to typing. Bundles for iOS; device test outstanding.
7. Interpretation: `POST /intents/parse` on the server calls OpenAI `gpt-4.1-mini` with a strict JSON schema, and the answer is validated on the server and again on the phone. Built and live-tested on three requests. The review screen shows the result and schedules nothing. A 100+ case evaluation set is not built yet.
