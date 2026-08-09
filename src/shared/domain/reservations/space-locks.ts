import "server-only";
import { SPACE_SCHEDULE_LOCK_NAMESPACE } from "@/shared/domain/advisory-lock-namespaces";

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
 */
export async function lockSpaceForTransaction(
  tx: SpaceLockClient,
  spaceId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SPACE_SCHEDULE_LOCK_NAMESPACE}::int4, hashtext(${spaceId}))`;
}

/** 複数 Space への cancel / bulk write 前に id 昇順で 728351 を取得（deadlock 予防）。 */
export async function lockSpacesForTransactionInOrder(
  tx: SpaceLockClient,
  spaceIds: Iterable<string>,
): Promise<void> {
  const uniqueSorted = [...new Set(spaceIds)].sort();
  for (const spaceId of uniqueSorted) {
    await lockSpaceForTransaction(tx, spaceId);
  }
}
