# Alarm sound and alerts: what is possible

Checked 2026-10-29 against the archived notes and the developer forum reports cited there. Apple's AlarmKit reference pages could not be read by the tools used, so the points marked "unverified" must be checked on a device and against Apple's current documentation.

## What the app offers

| Feature | Status | Notes |
| --- | --- | --- |
| Five distinct tones | Built | Original tones from `tools/generate-sounds.py`. Each has an alarm file (`.caf`) and a preview (`.m4a`). |
| Choose a tone per alarm | Built | Picker on the quick alarm and on the wake alarm of a plan. |
| Hear a tone before choosing | Built | Preview plays the same tone that the alarm uses. |
| Snooze | Built | A 5-minute snooze button on the alarm, using the system countdown. |
| Honest result | Built | If iOS plays its standard tone instead, the screen says so. |
| Stop, then a challenge | Built | Three sums after Stop (`src/app/challenge.tsx`). Opens when the app is next active. Accessible exit: a 3-second hold, or a plain link. |

## What the platform does not allow (as far as we can tell)

- **Extra loud.** No API sets alarm volume. The alarm plays at the phone's alarm volume. The app must not claim it can make an alarm louder.
- **Vibration control.** No API found. An alarm vibrates as the system decides.
- **Custom tones from the person's own library.** AlarmKit plays only files bundled with the app. So a person cannot pick one of their own songs as an alarm.
- **Length of a custom tone.** Developer reports say a bundled file should be no longer than about 30 seconds and plays once. Unverified.
- **Reliable custom bundled tones on iOS 26.** Developer forum reports describe bundled `.caf` files playing for some people and falling back to the system tone for others. The app detects the fallback and says so, but whether our tones play must be checked on the phone.

## What to test on the phone

0. The challenge: stop an alarm, check the sums open, check the 3-second hold and the plain link both leave.

1. Each of the five tones: does it play, and is it the tone chosen?
2. A tone with the phone locked, and with the app force-quit.
3. Snooze: does the countdown appear, and does the alarm ring again?
4. Silent switch and Focus: how the alarm behaves, recorded as observed, not promised.
