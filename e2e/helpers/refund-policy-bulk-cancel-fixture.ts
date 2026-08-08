/**
 * E2E-01 (money-touching gate): admin series bulk-cancel refund-policy E2E fixture.
 *
 * PR #1179 (PERF-02-FIX) が修正した「Settings.findUnique 失敗時に refund-policy snapshot が
 * `null` として per-instance に降り、`applyCancellationSideEffects` が「policy 未設定 =
 * 残額全額返金」動作に fallback する silent bug」を防ぐ回帰ゲートを構築するための
 * 独立フィクスチャ。単発の seed パスで冪等に作れないため (Settings.refundPolicy の
 * mutate と complementary な PAID reservation の pin が必要)、spec 内 beforeAll /
 * afterAll から実行する専用 helper に切り出す。
 *
 * 契約:
 *   - PrismaClient は Playwright process 専用の共有 client (`./e2e-prisma`) を使う
 *     (webServer の Prisma facade は `server-only` で import できない)
 *   - Settings は singleton のため mutation 前に既存 refundPolicy を snapshot し、
 *     afterAll で restore する (fullyParallel 時の他 spec 汚染を防ぐ、
 *     rules `testing-e2e.md` §並列化)
 *   - 予約は **この spec が専有するスペース** (`spaceFixtures.seriesRefundSpaceSlug`)
 *     に作る。共有スペースに作ると EXCLUDE 制約
 *     `reservations_no_active_time_overlap_excl` で他 fixture と衝突しうるし、
 *     「自分の残骸だけを消す」purge も書けない
 *   - AuditLog は append-only のため cleanup しない (書込済みは残る、spec 側で
 *     `resourceId` で絞って検証すれば影響ゼロ)
 *
 * @module e2e/helpers/refund-policy-bulk-cancel-fixture
 */

import { spaceFixtures } from "../fixtures/test-data";
import { getE2EPrismaClient } from "./e2e-prisma";
import {
  createReservationSeriesFixture,
  purgeReservationSeriesFixture,
} from "./reservation-series-fixture";

const REFUND_FIXTURE_NOTE_PREFIX =
  "[E2E] recurring series (E2E-01 refund policy)";
const REFUND_FIXTURE_STRIPE_PAYMENT_INTENT_PREFIX = "pi_e2e_01_bulk_cancel_";

/**
 * fixture の遠未来日 (2028-01-04, 01-11, 01-18 火曜)。全 instance は
 * startTime > E2E_FIXED_NOW_ISO (2026-07-04) + 1 年以上のため、`hoursBefore: 168`
 * tier に match して 50% 返金が適用される (`calculateRefundRate` は
 * hoursUntilStart >= 168 で `refundRate: 50` を採用)。
 */
const REFUND_FIXTURE_START_TIMES_UTC = [
  new Date("2028-01-04T01:00:00.000Z"),
  new Date("2028-01-11T01:00:00.000Z"),
  new Date("2028-01-18T01:00:00.000Z"),
] as const;
const REFUND_FIXTURE_DURATION_MINUTES = 120;
const REFUND_FIXTURE_TOTAL_PRICE = 5000;
const REFUND_FIXTURE_TAX_RATE = 10;
const REFUND_FIXTURE_RRULE = "FREQ=WEEKLY;BYDAY=TU;COUNT=3";

/**
 * 検証したい RefundPolicy (Settings.refundPolicy JSON カラム)。
 *
 *   tiers[0]: hoursBefore=168 (7 日) → refundRate=50%
 *   defaultRefundRate: 100%
 *
 * fixture の各 instance は startTime が現在時刻から 1 年以上先のため、
 * `calculateRefundRate` は tiers[0] に match して 50% を返す。
 * バグ (snapshot=null で fallback 発火) 時は per-instance で
 * `refundPolicySnapshot` を渡さない代わりに `resolveRefundPolicy(null)=unset`
 * になり、`policy !== null` の gate を抜けて `refundAmount=undefined`
 * (残額全額) で refund 呼出 → totalPrice=5000 の全額返金が意図せず走る。
 */
export const REFUND_FIXTURE_POLICY = {
  tiers: [{ hoursBefore: 168, refundRate: 50 }],
  defaultRefundRate: 100,
} as const;

/** setup 結果を spec 側に返す構造。 */
export interface RefundPolicyBulkCancelFixture {
  seriesId: string;
  /** startTime asc 順の instance id 配列 (先頭が admin UI ナビ対象)。 */
  instanceIds: readonly string[];
  /** afterAll で restore するために snapshot した Settings.refundPolicy の元値。 */
  originalRefundPolicy: unknown;
}

/**
 * fixture setup: (1) Settings.refundPolicy を 50% tier に置き換え、(2) 専有スペースに
 * 3 件の CONFIRMED PAID reservation を持つ ReservationSeries を作成。
 */
export async function setupRefundPolicyBulkCancelFixture(): Promise<RefundPolicyBulkCancelFixture> {
  const client = getE2EPrismaClient();

  // Step 1: SettingsCommerce snapshot + refundPolicy 置き換え
  const commerce = await client.settingsCommerce.findUnique({
    where: { id: "singleton" },
    select: { refundPolicy: true },
  });
  if (!commerce) {
    throw new Error(
      "SettingsCommerce singleton row が見つかりません。seed 実行を確認してください。",
    );
  }
  const originalRefundPolicy = commerce.refundPolicy;
  await client.settingsCommerce.update({
    where: { id: "singleton" },
    data: {
      refundPolicy: REFUND_FIXTURE_POLICY,
    },
  });

  // Step 2: 専有スペースを purge して series + 3 PAID instance を作り直す。
  // 前回の run が途中で落ちて残っていても、ここで必ず 1 series だけの状態になる。
  const { seriesId, instanceIds } = await createReservationSeriesFixture({
    spaceSlug: spaceFixtures.seriesRefundSpaceSlug,
    rrule: REFUND_FIXTURE_RRULE,
    startTimes: REFUND_FIXTURE_START_TIMES_UTC,
    durationMinutes: REFUND_FIXTURE_DURATION_MINUTES,
    totalPrice: REFUND_FIXTURE_TOTAL_PRICE,
    taxRate: REFUND_FIXTURE_TAX_RATE,
    notePrefix: REFUND_FIXTURE_NOTE_PREFIX,
    payment: {
      kind: "PAID",
      paymentIntentPrefix: REFUND_FIXTURE_STRIPE_PAYMENT_INTENT_PREFIX,
      paidAt: new Date(),
    },
  });

  return { seriesId, instanceIds, originalRefundPolicy };
}

/** afterAll で fixture を teardown する。Settings.refundPolicy も元値に戻す。 */
export async function teardownRefundPolicyBulkCancelFixture(
  fixture: RefundPolicyBulkCancelFixture,
): Promise<void> {
  const client = getE2EPrismaClient();

  await purgeReservationSeriesFixture(spaceFixtures.seriesRefundSpaceSlug);

  // Settings.refundPolicy を restore (originalRefundPolicy は null / object / undefined
  // のいずれか)。value import 経由の `Prisma.JsonNull` は使えない (client 経路の
  // `import.meta` エラーを回避するため type-only import に絞っている) ので、null
  // 復元は raw SQL で NULL 代入する。
  if (
    fixture.originalRefundPolicy === null ||
    fixture.originalRefundPolicy === undefined
  ) {
    await client.$executeRaw`UPDATE settings_commerce SET refund_policy = NULL WHERE id = 'singleton'`;
  } else {
    await client.settingsCommerce.update({
      where: { id: "singleton" },
      data: {
        refundPolicy: fixture.originalRefundPolicy,
      },
    });
  }
}

/** Reservation.status を Set にして返す (テスト側で「全 CANCELLED」を照合する用途)。 */
export async function getReservationStatuses(
  instanceIds: readonly string[],
): Promise<Record<string, string>> {
  const client = getE2EPrismaClient();
  const rows = await client.reservation.findMany({
    where: { id: { in: [...instanceIds] } },
    select: { id: true, status: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

/** ReservationSeries.deletedAt が set されているか。polling 用。 */
export async function isSeriesSoftDeleted(seriesId: string): Promise<boolean> {
  const client = getE2EPrismaClient();
  const row = await client.reservationSeries.findUnique({
    where: { id: seriesId },
    select: { deletedAt: true },
  });
  return row?.deletedAt !== null && row?.deletedAt !== undefined;
}

/**
 * per-instance AuditLog metadata を取得する (E2E-01 の money-touching 観測点)。
 *
 * `applyCancellationSideEffects` は最終ステップで `resource: "reservation"` の
 * AuditLog を 1 レコード書き、`metadata.sideEffects.refund` に refund 副作用の
 * outcome を集約する。E2E-01 では: (a) wasPaid=true, requiresRefund=true が
 * 記録されている、(b) sideEffects.refund が undefined でない (= refund step が
 * skip されず実行された) の 2 点を per-instance に assert する。
 *
 * 補足: E2E 環境で Stripe credentials は偽物のため refund step 内の Stripe 呼出が
 * 失敗し、outcome は `{ status: "error", reason: "..." }` になる。amount の直接観測は
 * できない (product code は success 時のみ outcome.detail.refundAmount を記録するため)。
 * amount 検証は `__tests__/unit/domain/reservations/bulk-side-effects.test.ts`
 * で PERF-02-FIX の対称 unit 覆盖として担保する分担。本 E2E は「pipeline が
 * 起動して per-instance に伝播した」ことを end-to-end で保証する。
 */
export interface CancellationAuditRecord {
  resourceId: string;
  wasPaid: boolean | null;
  requiresRefund: boolean | null;
  hasRefundOutcome: boolean;
  refundOutcomeStatus: string | null;
}

export async function getPerInstanceCancellationAudits(
  instanceIds: readonly string[],
): Promise<CancellationAuditRecord[]> {
  const client = getE2EPrismaClient();
  const rows = await client.auditLog.findMany({
    where: {
      resource: "reservation",
      resourceId: { in: [...instanceIds] },
      action: "UPDATE",
    },
    select: { resourceId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const seen = new Set<string>();
  const result: CancellationAuditRecord[] = [];
  for (const row of rows) {
    if (row.resourceId === null) continue;
    if (seen.has(row.resourceId)) continue;
    const metadata =
      typeof row.metadata === "object" &&
      row.metadata !== null &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const sideEffects =
      typeof metadata["sideEffects"] === "object" &&
      metadata["sideEffects"] !== null &&
      !Array.isArray(metadata["sideEffects"])
        ? (metadata["sideEffects"] as Record<string, unknown>)
        : null;
    // 本 spec が観測したい cancellation AuditLog に限定する
    // (refund payment 経路や別 update は sideEffects を持たないため排除)
    if (sideEffects === null) continue;
    const refundOutcome =
      typeof sideEffects["refund"] === "object" &&
      sideEffects["refund"] !== null &&
      !Array.isArray(sideEffects["refund"])
        ? (sideEffects["refund"] as Record<string, unknown>)
        : null;
    seen.add(row.resourceId);
    result.push({
      resourceId: row.resourceId,
      wasPaid:
        typeof metadata["wasPaid"] === "boolean" ? metadata["wasPaid"] : null,
      requiresRefund:
        typeof metadata["requiresRefund"] === "boolean"
          ? metadata["requiresRefund"]
          : null,
      hasRefundOutcome: refundOutcome !== null,
      refundOutcomeStatus:
        refundOutcome !== null && typeof refundOutcome["status"] === "string"
          ? refundOutcome["status"]
          : null,
    });
  }
  return result;
}

/** series 単位の AuditLog (resource: "reservation_series") が存在するか。 */
export async function findSeriesCancellationAudit(seriesId: string): Promise<{
  scope: string | null;
  cancelledIdsCount: number;
} | null> {
  const client = getE2EPrismaClient();
  const row = await client.auditLog.findFirst({
    where: {
      resource: "reservation_series",
      resourceId: seriesId,
      action: "UPDATE",
    },
    select: { newValue: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  const newValue =
    typeof row.newValue === "object" &&
    row.newValue !== null &&
    !Array.isArray(row.newValue)
      ? (row.newValue as Record<string, unknown>)
      : {};
  const cancelledIds = Array.isArray(newValue["cancelledIds"])
    ? newValue["cancelledIds"]
    : [];
  return {
    scope: typeof newValue["scope"] === "string" ? newValue["scope"] : null,
    cancelledIdsCount: cancelledIds.length,
  };
}
