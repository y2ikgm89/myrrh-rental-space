/**
 * `$queryRaw` の `COUNT(*)::bigint` を Number にする。
 *
 * Prisma は raw COUNT を bigint で返す。呼び出し側が `Number(...)` だけだと
 * 型注釈と実行時がずれてもコンパイルが通る。safe integer を超えたら throw。
 */
export function numberFromBigintCount(value: bigint | undefined): number {
  const n = Number(value ?? 0n);
  if (!Number.isSafeInteger(n)) {
    throw new Error("COUNT(*) exceeded Number.MAX_SAFE_INTEGER");
  }
  return n;
}
