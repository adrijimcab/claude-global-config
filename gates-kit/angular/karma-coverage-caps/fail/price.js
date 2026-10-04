function withTax(amount, rate) {
  return amount + amount * rate;
}

function format(amount) {
  return amount.toFixed(2);
}

function discount(amount, percent) {
  if (percent > 50) {
    return amount / 2;
  }

  return amount - (amount * percent) / 100;
}

function round(amount) {
  return Math.round(amount);
}
