import { journeyNeed, minutesFromEstimate } from '../../src/journey/estimateMode';
import type { Interpretation } from '../../src/domain/interpretation';

function reading(requests: Interpretation['requests']): Interpretation {
  return {
    schemaVersion: 3,
    goal: 'Be at work for 9',
    intentType: 'purpose_alarm',
    confidence: 0.9,
    commitments: [],
    requests,
    questions: [],
  };
}

describe('journeyNeed', () => {
  it('asks for a bus estimate when the reading says bus', () => {
    expect(journeyNeed(reading([{ capability: 'transit', reason: 'bus', params: { from: 'Edinburgh', to: 'Glasgow' } }]))).toEqual({ mode: 'bus', from: 'Edinburgh', to: 'Glasgow' });
  });

  it('asks for a car estimate when the reading says road', () => {
    expect(journeyNeed(reading([{ capability: 'road', reason: 'drive', params: { from: 'Bathgate', to: 'Glasgow' } }]))).toEqual({ mode: 'car', from: 'Bathgate', to: 'Glasgow' });
  });

  it('leaves trains to the live timetable', () => {
    expect(journeyNeed(reading([{ capability: 'rail', reason: 'train', params: { from: 'BHG', to: 'EDB' } }]))).toBeNull();
  });

  it('asks how the person travels when the places are known but the mode is not', () => {
    expect(journeyNeed(reading([{ capability: 'alarm', reason: 'go', params: { from: 'Edinburgh', to: 'Glasgow' } }]))).toBe('needs_mode');
  });

  it('needs nothing when there is no journey', () => {
    expect(journeyNeed(reading([]))).toBeNull();
  });
});

describe('minutesFromEstimate', () => {
  it('plans for the top of the range, rounded up to five minutes', () => {
    expect(minutesFromEstimate(65, 82)).toBe(85);
    expect(minutesFromEstimate(60, 60)).toBe(60);
  });
});
