# Adding alarm sounds

Alarm tones are part of the app build. AlarmKit only plays files bundled with the app, so a new tone needs a new native build. It cannot be downloaded later, and an over-the-air update of the JavaScript cannot add one.

## Steps

1. **Get the audio.** Use original audio, or audio you have a licence to ship. The five current tones are synthesised by `tools/generate-sounds.py` (archived), so they are original to WakeWise.
2. **Make a WAV** (16-bit, mono or stereo, 44.1 kHz) and keep it short. Developers report a limit of about 30 seconds for alarm files, which is unverified. Keep it under 30 seconds.
3. **Convert to CAF** with the macOS tool:
   ```
   afconvert -f caff -d LEI16 tone.wav wakewise_<name>.caf
   ```
4. **Add the CAF** to `modules/wakewise-alarm/ios/Sounds/`. The podspec copies everything in that folder into the app bundle (`s.resources = "Sounds/*.caf"`).
5. **Make a preview** as an `.m4a` in `assets/sounds/preview/`. This is what the app plays when the person taps a tone.
6. **Register it** in `src/sound/wakeSounds.ts`: an id, a name, a short description, the `.caf` file name, and the `.m4a` preview. Ids are stored with alarms, so never rename one.
7. **Build natively.** Run `npx expo prebuild --platform ios --no-install`, then `pod install`, then build. A phone build needs the cable and Apple signing.
8. **Test on the phone:** the tone plays when the alarm rings, locked and with the app closed. If iOS plays its standard tone instead, the alarm screen says so. Treat that as a failure to investigate, not a success.

## Known limits

- Only bundled files. A person cannot pick a song from their own library.
- Reports from developers say bundled files on iOS 26 play for some people and fall back for others. Check each new tone on a real phone.
- Volume and vibration cannot be set by the app. A tone plays at the phone's alarm volume.
