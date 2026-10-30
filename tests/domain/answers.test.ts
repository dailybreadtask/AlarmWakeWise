import { withAnswers } from '../../src/domain/answers';

describe('withAnswers', () => {
  it('adds each answer after its question, to the original request', () => {
    expect(withAnswers('Be at work for 7', ['What time?'], ['7pm'])).toBe('Be at work for 7. What time? 7pm');
  });

  it('keeps the original text and trims the answers', () => {
    expect(withAnswers('Study group  ', ['Which day?', 'What time?'], [' Wednesday ', '6pm'])).toBe('Study group. Which day? Wednesday. What time? 6pm');
  });
});
