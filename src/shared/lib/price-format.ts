export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(value);
}

export function formatPrice(
  value: number | null | undefined,
  fallback = "要問合せ",
): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  return formatCurrency(value);
}
