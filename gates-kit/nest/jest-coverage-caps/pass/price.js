function withTax(amount, rate) {
  return amount + amount * rate;
}

function format(amount) {
  return amount.toFixed(2);
}

module.exports = { withTax, format };
