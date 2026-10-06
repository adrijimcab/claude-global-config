export function withTax(amount, rate) {
  return amount + amount * rate;
}

export function format(amount) {
  return amount.toFixed(2);
}

export function discount(amount, percent) {
  if (percent > 50) {
    return amount / 2;
  }

  return amount - (amount * percent) / 100;
}

export function round(amount) {
  return Math.round(amount);
}
