export function changedFieldNames<T extends Record<string, unknown>>(
  previous: T,
  next: Partial<T>,
): string[] {
  return Object.keys(next)
    .filter((k) => next[k] !== previous[k])
    .sort();
}
