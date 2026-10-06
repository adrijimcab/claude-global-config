import { sum } from './sum';

// A string where `sum` takes a number: a spec the test runner may run without ever type-checking.
export const expected: number = sum('1', 2);
