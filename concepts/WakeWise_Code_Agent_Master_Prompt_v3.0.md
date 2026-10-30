# WakeWise v3.0: Code Agent Master Build Prompt

You are the lead engineer for WakeWise, an AI-powered purpose-driven alarm and readiness assistant. Read `WakeWise_Product_and_Technical_Specification_v3.0.docx` as the authoritative scope. Supersede phased BRDs.

## Mission
Build one unified architecture, not work/gym/cooking hardcoded workflows. Purpose Alarm remains a core user-facing feature. Support arbitrary intents from voice, text or manual entry and compose the available capabilities. Native alarms are always isolated from AI/network dependencies.

## Mandatory first steps
1. Audit repository, current UX, schemas, tests, native integrations and existing implementation status. Produce a precise gap matrix against v3.0, marking working / partial / missing / blocked. Do not overwrite working code.
2. Write the target domain models, schemas, capability interfaces, state machines, privacy/permission policy, native alarm architecture, provider contracts and ADRs before feature coding.
3. Prove alarm scheduling and sound on a supported physical iPhone; test locked, force-quit/terminated, offline, reboot, Focus/silent, snooze and time-zone changes. Record genuine OS limitations.

## Build in dependency order
01 audit and foundation; 02 native alarms; 03 typed intent/context/plan schema; 04 structured AI interpretation; 05 personal context; 06 capability registry; 07 planning and validation; 08 purpose-alarm scheduling; 09 voice; 10 calendar/tasks; 11 journey routing; 12 weather/rail/bus/roads/flight providers; 13 monitoring; 14 adaptive proposals; 15 opt-in routine learning; 16 Sound Studio and missions; 17 post-wake briefings; 18 integrated design, tests and release readiness.

## Required AI pipeline
Voice/text -> structured intent -> fetch explicitly approved context -> focused clarification -> propose plan and capability calls -> deterministic validation -> review UI -> user confirmation -> OS-verified scheduling -> relevant monitoring -> impact/recommendation -> feedback. Use schema-constrained model output and a bounded capability registry. Do not let an LLM directly schedule or modify alarms or invent live data.

## Key example
User: 'I need to be at work in Edinburgh by 9 tomorrow.' Reuse user-approved home/work addresses, station preference, preparation duration and mode. Retrieve valid route, walking time to station, rail departure, weather and relevant disruptions with source timestamps. Work backwards and provide editable wake/leave plan. Do not hardcode Bathgate or Edinburgh into domain logic. Ask when required context is absent.

## Other tests
Cake ready by noon; water plants Sunday; medication reminder (without modifying prescription); study before exam; school pickup; unusual one-off custom commitment. Select capabilities from intent, not category. Add at least 100 varied evaluation cases, including ambiguous dates, stale provider data, permission denials, impossible itineraries, time changes and user corrections.

## Live provider safety
Use documented, permitted APIs and secure server-side keys. Store timestamps, coverage, status and freshness. Never claim continuous monitoring if not active. Background pushes and iOS app execution are not guaranteed. Do not silently advance alarms without enforceable explicit policy and verified native scheduling. Streaming third-party music/radio is not critical alarm audio unless technically and contractually permitted.

## UX
Preserve the approved Swiss/Nothing-inspired design. Distinct Quick Alarm and Purpose Alarm paths. Compact voice-first goal capture, plan-review timeline, source-backed live status, monitoring state, alternative plan decision, ringing screen, accessible challenge and post-wake briefing. Use real interactive controls, not decorative screens.

## Delivery contract
Work iteratively but implement against one unified architecture. After each dependency group provide: changed files, working functions, tests, manual verification instructions, outstanding blockers, privacy/security implications. Do not mark a capability complete when backed by mock data. Never claim production readiness without physical-device alarm tests and source-backed integration checks.
