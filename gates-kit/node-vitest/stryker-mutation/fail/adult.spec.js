import { isAdult } from './adult.js';

describe('isAdult', () => {
  it('is true for an adult', () => {
    expect(isAdult(30)).toBe(true);
  });
});
