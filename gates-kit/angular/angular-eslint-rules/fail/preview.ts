/**
 * Stands in for an experimental Angular API (the rule reads the JSDoc tag of the symbol a file uses).
 * @experimental
 */
export function previewTotal(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Stands in for a developer-preview Angular API.
 * @developerPreview
 */
export function previewLabel(total: number): string {
  return `total ${total}`;
}
