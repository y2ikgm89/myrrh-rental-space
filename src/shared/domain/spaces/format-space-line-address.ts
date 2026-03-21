/**
 * 公開・予約・カレンダーで用いる「1行の所在地」。
 * 建物住所（Location）を正本とし、任意の addressDetail（号室・フロア等）を付加する。
 */
export function formatSpaceLineAddress(
  locationAddress: string,
  addressDetail: string | null | undefined,
): string {
  const base = locationAddress.trim();
  const detail = addressDetail?.trim();
  if (detail === undefined || detail.length === 0) {
    return base;
  }
  return `${base} ${detail}`;
}
