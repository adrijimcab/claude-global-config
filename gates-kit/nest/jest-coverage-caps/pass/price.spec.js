const { format, withTax } = require('./price');

describe('price', () => {
  it('adds the tax', () => {
    expect(withTax(100, 0.2)).toBe(120);
  });

  it('formats with two decimals', () => {
    expect(format(1.5)).toBe('1.50');
  });
});
