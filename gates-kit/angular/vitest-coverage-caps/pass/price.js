export function withTax(amount, rate) {
  return amount + amount * rate;
}

export function format(amount) {
  return amount.toFixed(2);
}
