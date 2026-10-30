# WakeWise design decisions

Source: `concepts/WakeWise v3.0 Mockup.pdf` (15 pages), with the design rules from the installed `apple-design` and `animate-expo` skills. Tokens are in `src/theme/tokens.ts`.

## Visual

- **Palette (approved v3.0 mockup, restored 2026-10-29):** off-white paper `#F4F4F2`, black ink `#111111`, muted `#6B6B68`, and one signal yellow `#F5E14B` for the primary action on each screen. Black text sits on yellow. The grey palette and metallic effects were tried and dropped to return to the mockup.
- **Type:** the system font, light numerals for the wake time, as in the mockup. On iOS that is SF Pro, which has optical sizing and tracking tuned for each size, so we don't ship a custom face. The large wake-time numerals use weight 200 and tracking of -2.
- **Surfaces:** white cards with 16 px radius, no shadow. Dotted paper on the capture screen, as in the mockup. Hairline dividers (`StyleSheet.hairlineWidth`).
- **Empty states are honest.** The home screen shows "None set", not the mockup's sample alarm times, because nothing is scheduled yet.

## Motion

- **Press feedback** (`src/components/PressScale.tsx`): controls shrink to 0.97 on press-in in 120 ms, and return in 150 ms, both ease-out. Feedback starts on press-in, not release. Controls are never scaled from zero.
- **Entrances** (plan timeline): rows fade in and rise 25 px in order, 40 ms apart, over 280 ms. These are standard, occasional moments, so they get a short motion.
- **No animation on tab switches.** There are no tabs yet. When they land, they use `animation: 'none'`.
- **Reduced motion** is handled in the component, not added later. With the system setting on, press feedback loses its scale and entrances become a 200 ms fade.
- **Nothing is animated on the JavaScript thread through React state.** Press state is a Reanimated shared value.

## Haptics

Each haptic is paired with a visual change, and fires once per user action:

| Moment | Haptic |
| --- | --- |
| Talk button pressed (start or stop recording) | light impact |
| Stepper changes an estimate | selection tick, once per change |
| Request could not be read or sent | error notification |

No haptic on scroll, on entrance animations, or on success navigation. Haptics are never the only feedback.

## Decisions still open

- **Typeface.** The mockup's typeface may be Geist. Keep the system font unless the mockup is confirmed as a licensed face we want.
- **Dotted background.** The mockup's capture screen has a dot grid. Not built: it would mean many layered views on every render. Revisit with a single SVG pattern.
- **Translucent chrome.** The mockup's bottom bar is not translucent. Add it only with the tab bar, using a native `NativeTabs` bar rather than a custom one.
- **Plan approval.** Approving sets the wake alarm only. Travel and reminder steps are not scheduled yet, and the screen says so.
