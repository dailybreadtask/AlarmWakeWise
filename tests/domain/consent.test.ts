import { hasConsent, setConsent, type ConsentMap } from '../../src/consent/consent';

describe('consent', () => {
  it('treats a scope with no record as not allowed', () => {
    expect(hasConsent({}, 'speech')).toBe(false);
  });

  it('allows a scope only after it is granted', () => {
    const granted = setConsent({}, 'speech', true, '2026-10-29T09:00:00Z');
    expect(hasConsent(granted, 'speech')).toBe(true);
    expect(hasConsent(granted, 'calendar')).toBe(false);
  });

  it('revokes a scope when it is switched off, and keeps the change time', () => {
    const on: ConsentMap = setConsent({}, 'speech', true, '2026-10-29T09:00:00Z');
    const off = setConsent(on, 'speech', false, '2026-10-29T10:00:00Z');
    expect(hasConsent(off, 'speech')).toBe(false);
    expect(off.speech?.changedAt).toBe('2026-10-29T10:00:00Z');
  });

  it('does not change the original map', () => {
    const before: ConsentMap = {};
    setConsent(before, 'speech', true, '2026-10-29T09:00:00Z');
    expect(before).toEqual({});
  });
});
