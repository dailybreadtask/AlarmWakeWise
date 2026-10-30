import { DEFAULT_WAKE_SOUND_ID, soundById, WAKE_SOUNDS } from '../../src/sound/wakeSounds';
import { toNativeRequest } from '../../src/alarm/alarmScheduler';

describe('wake sounds', () => {
  it('ships distinct tones, each with its own alarm file', () => {
    expect(WAKE_SOUNDS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(WAKE_SOUNDS.map((s) => s.id)).size).toBe(WAKE_SOUNDS.length);
    expect(new Set(WAKE_SOUNDS.map((s) => s.alarmFile)).size).toBe(WAKE_SOUNDS.length);
    expect(WAKE_SOUNDS.every((s) => s.alarmFile.endsWith('.caf'))).toBe(true);
  });

  it('falls back to the default tone for an unknown id', () => {
    expect(soundById('no-such-tone').id).toBe(DEFAULT_WAKE_SOUND_ID);
  });
});

describe('alarm request', () => {
  const base = { nativeId: '7f9c2a1e-4b3d-4e8f-9a2b-1c2d3e4f5a6b', wakeAt: new Date(2026, 9, 29, 6, 50), title: 'WakeWise alarm' };

  it('carries the chosen tone and the snooze length', () => {
    const request = toNativeRequest({ ...base, soundFile: 'wakewise_pulse.caf', snoozeMinutes: 5 });
    expect(request).toMatchObject({ soundFile: 'wakewise_pulse.caf', snoozeMinutes: 5 });
  });

  it('uses the system tone when no tone is given', () => {
    expect(toNativeRequest(base)).toMatchObject({ soundFile: null, snoozeMinutes: 0 });
  });

  it('sends the exact instant, so an alarm for a future date rings on that date', () => {
    const future = new Date(2026, 10, 7, 9, 0);
    expect(toNativeRequest({ ...base, wakeAt: future }).fireAtMs).toBe(future.getTime());
  });
});
