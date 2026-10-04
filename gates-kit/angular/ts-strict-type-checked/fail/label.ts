export function label(value: string): string {
  // `value` can never be undefined, so the condition is always true (no-unnecessary-condition).
  return value !== undefined ? value : 'none';
}
