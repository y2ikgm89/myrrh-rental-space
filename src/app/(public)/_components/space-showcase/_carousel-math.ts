export interface CardStyle {
  readonly zIndex: number;
  readonly scale: number;
  readonly opacity: number;
}

export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function computeDistance(
  activeIndex: number,
  cardIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const raw = Math.abs(cardIndex - activeIndex);
  return Math.min(raw, count - raw);
}

export function getCardStyle(distance: number): CardStyle {
  if (distance === 0) return { zIndex: 30, scale: 1, opacity: 1 };
  if (distance === 1) return { zIndex: 20, scale: 0.9, opacity: 0.7 };
  if (distance === 2) return { zIndex: 10, scale: 0.82, opacity: 0.4 };
  return { zIndex: 5, scale: 0.75, opacity: 0.2 };
}

/**
 * Compute the shortest signed step from `current` real index to `target` real index
 * across a circular index space of size `count`. Used by dot-navigation to wrap
 * around in the shorter direction.
 *
 * Returns 0 when `target === current`.
 */
export function shortestStep(
  current: number,
  target: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const diff = target - current;
  if (Math.abs(diff) <= count / 2) return diff;
  return diff > 0 ? diff - count : diff + count;
}
