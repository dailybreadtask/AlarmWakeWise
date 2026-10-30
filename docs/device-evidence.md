# Device evidence

Record of what has been proven on a physical device. Anything not listed here is unverified.

## Quick alarm, first ring

- **Date:** 2026-10-29
- **Device:** iPhone 15 Pro, iOS 26.6.2, development build (SDK 57, Xcode 27.1)
- **Path:** request "Set an alarm to go off in 1 minute" → server reading (quick_alarm, `inMinutes: 1`) → review screen → Set alarm → iOS AlarmKit
- **Result:** the alarm rang at the set time. No surprises reported by the tester.
- **Not recorded:** whether the phone was locked, whether the app was closed or force-quit, the sound and volume, and any Focus or silent-mode setting. These are still required by the device test list.

## Still to test on device

From the spec's native alarm acceptance list (§11):

- Phone locked with the screen off
- App force-quit, then the alarm fires
- Airplane mode (no network)
- Device restart after scheduling
- Focus and silent mode
- Snooze and Stop, and the challenge after Stop
- Time-zone change and daylight-saving change
- Several alarms at once
- Permission changes while an alarm is scheduled
