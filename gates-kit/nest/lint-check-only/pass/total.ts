export function total(values: readonly number[]): number {
  const sum = values.reduce((accumulator, value) => accumulator + value, 0);

  return sum;
}
