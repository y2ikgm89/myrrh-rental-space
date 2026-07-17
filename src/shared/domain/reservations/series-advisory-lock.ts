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
 * 生成 Prisma の `Prisma.TransactionClient`（拡張前の基底型）は `$extends` 済み
 * app 標準 client（`src/shared/db/prisma.ts` の `prisma`）の tx コールバック型と
 * `exactOptionalPropertyTypes: true` 下で構造的に非互換（拡張後 model メソッドの
 * `SelectSubset` 引数型が食い違う）なため使わない。
 */
export async function lockReservationSeriesForTransaction(
  tx: SeriesLockClient,
  seriesKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728357::int4, hashtext(${seriesKey})::int4)`;
}
