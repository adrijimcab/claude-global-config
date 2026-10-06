import { isAdult } from './adult.js';

describe('isAdult', () => {
  it('is false under eighteen', () => {
    expect(isAdult(17)).toBe(false);
  });

  it('is true at eighteen', () => {
    expect(isAdult(18)).toBe(true);
  });
});
