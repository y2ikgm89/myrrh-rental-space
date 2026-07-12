import "server-only";

type SpaceLockClient = {
  readonly $executeRaw: (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
};

/**
 * Space 上の予約・イベント枠の書込を interactive tx 内でシリアライズする advisory lock。
 *
 * Reservation overlap check と Event ↔ Reservation cross-table overlap check は
 * いずれも read-before-write のため、同一 Space に対する全 mutation を tx 単位で
 * 順序付ける必要がある。namespace 728351 は業務上「Space スケジュール空間」で
 * 共有され、Reservation と EventTimeSlot の write path はどちらもこの lock を先取する。
 *
 * (namespace registry は `.claude/rules/db-domain.md` の advisory lock 一覧参照)
 */
export async function lockSpaceForTransaction(
  tx: SpaceLockClient,
  spaceId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728351::int4, hashtext(${spaceId}))`;
}
