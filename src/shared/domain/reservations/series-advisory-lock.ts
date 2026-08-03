import "server-only";

type SeriesLockClient = {
  readonly $executeRaw: (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
};

/**
 * ReservationSeries 単位 advisory lock。
 *
 * namespace 728357 は `.claude/rules/db-domain.md` の advisory lock registry で
 * Phase B.2 用に予約済（Phase B.1 spec で予告済）。ReservationSeries 作成・
 * 一括キャンセル等、series 全体にまたがる書込を interactive tx 単位でシリアライズする。
 *
 * 既存の `lockSpaceForTransaction`（728351、Space 単位、`src/shared/domain/reservations/space-locks.ts`）
 * と併用可（2 段 lock）。`createReservationSeriesCommand` は 728357 → 728351 の順で
 * 取得する（deadlock 予防のため全経路で同順序を強制する）。
 *
 * `tx` の型は（`space-locks.ts` と同様）`$executeRaw` のみを要求する最小構造型。
 *
 * **app 標準 client（`src/shared/db/prisma.ts` の `prisma`）は `$extends` していない。**
 * 以前このコメントは「拡張済みなので `Prisma.TransactionClient` とは非互換」と
 * 書いていたが、実測すると現状の tx コールバック引数は `Prisma.TransactionClient` に
 * そのまま代入できる（`tsc` exit 0）。最小構造型を使うのは互換性の回避策ではなく、
 * 必要なメソッドだけを要求してテストで差し替えやすくするため。
 *
 * ただし旧コメントの懸念自体は実在する: 試しに `$extends` を足すと
 * `$transaction` のコールバック戻り型が壊れ、repo 全体で 546 件の型エラーになる
 * （実測）。拡張を導入するなら単独の変更として扱うこと。
 */
export async function lockReservationSeriesForTransaction(
  tx: SeriesLockClient,
  seriesKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728357::int4, hashtext(${seriesKey})::int4)`;
}
