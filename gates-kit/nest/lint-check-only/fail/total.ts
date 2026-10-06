export function total(values: readonly number[]): number {
  // `sum` is never reassigned: prefer-const is auto-fixable, so only a check-only run reports it.
  let sum = values.reduce((accumulator, value) => accumulator + value, 0);

  return sum;
}
