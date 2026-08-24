import "server-only";

import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  anonymizeCustomerCommand,
  CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME,
} from "@/shared/domain/customers/customer-lifecycle-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { ANONYMIZED_CUSTOMER_FIELDS } from "@/shared/lib/constants/anonymized-customer-fields";
import {
  parseDataRetentionConfig,
  type DataRetentionConfig,
} from "@/shared/lib/json-validators";
import {
  AuditAction,
  CustomerStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { getR2InquiriesBucketName } from "@/shared/lib/r2/client";
import { deleteObjectsFromBucket } from "@/shared/lib/r2/delete";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import type { Prisma } from "@generated/prisma/client";

/**
 * データ保持ポリシー実行 — PIPA 22 条 / GDPR 5(1)(e) 対応。
 *
 * 7 テーブルを対象に、`Settings.dataRetention` JSON の月数を経過したレコードを
 * 削除または PII 匿名化する。実運用は `/api/cron/data-retention` から呼び出される
 * （feature module `data-retention` の ON/OFF ゲートは cron 側で判定）。
 *
 * ## テーブル別戦略
 *
 * | Table              | Strategy   | 判定基準                                    |
 * | ------------------ | ---------- | ------------------------------------------- |
 * | Session            | DELETE     | createdAt < now - sessionMonths             |
 * | Verification       | DELETE     | createdAt < now - verificationMonths        |
 * | Reservation.guest* | NULL 化    | endTime + reservationGuestMonths < now      |
 * | EventRegistration（ゲスト申込のみ） | placeholder + NULL 化 | customerId=null ∧ slot.endAt + eventRegistrationGuestMonths < now |
 * | Inquiry            | DELETE     | createdAt < now - inquiryMonths             |
 * | Customer (INACTIVE)| PII 匿名化 | status=INACTIVE ∧ createdAt < cutoff ∧ ¬∃ reservation.endTime ≥ cutoff |
 *
 * ## 契約
 *
 * - 各 field の月数が `0` の場合はそのテーブルを touch しない（opt-out）
 * - 全て idempotent — 二度目以降の実行で追加削除は起きない（NULL 済 / 匿名化済は自動除外）
 * - Customer 匿名化は `email` を non-routable な `anonymized-<uuid>@myrrh-anon.invalid`
 *   （RFC 2606 `.invalid` TLD）に置換し、`emailCanonical` は同値の lower-case で保つ
 *   （UNIQUE 制約を破壊しない）
 * - 戻り値は各テーブルの対象件数（後段の logger / audit で使う）
 */
export interface DataRetentionPurgeResult {
  readonly sessionsDeleted: number;
  readonly verificationsDeleted: number;
  readonly reservationGuestFieldsAnonymized: number;
  readonly eventRegistrationGuestFieldsAnonymized: number;
  readonly inquiriesDeleted: number;
  readonly customersAnonymized: number;
}

/**
 * Settings singleton から dataRetention JSON を読んで parse する。
 * 存在しない / 不正値 → `DEFAULT_DATA_RETENTION_CONFIG`（fail-safe）。
 */
export async function getDataRetentionConfig(): Promise<DataRetentionConfig> {
  const row = await prisma.settingsDataRetention.findUnique({
    where: { id: "singleton" },
    select: { dataRetention: true },
  });
  return parseDataRetentionConfig(row?.dataRetention);
}

/**
 * `now` から `months` ヶ月前の UTC 時刻を返す。
 *
 * ## 月末の day overflow に注意（Codex 指摘 #3564864832）
 *
 * ネイティブの `Date.setUTCMonth(m - months)` は「target month に該当日が存在しない」
 * ケースを **翌月に overflow** させる仕様。例: `2027-08-31 - 6mo` は本来 2027-02 を
 * 期待するが setUTCMonth は Feb-31 が存在しないため 2027-03-03 を返す。
 *
 * これを cutoff として使うと March 1-2 に作られたレコードが「6mo 未満」なのに purge
 * 対象に入る（cutoff が本来より 3 日新しい）。データ保持契約の破壊。
 *
 * 対策: target month の最終日を計算し、元の day をその値でクランプする。
 * `2027-08-31 - 6mo` は 2027-02-28、`2028-08-31 - 6mo` は 2028-02-29 (閏年)。
 */
function monthsAgo(now: Date, months: number): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  // target year / month (負の月を modulo 演算で正規化)
  const totalMonths = month - months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  // target month の末日 (day 0 = 前月末) を計算し、元の day をクランプ
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

/**
 * 保持期限を過ぎた Session を削除する。`months === 0` なら no-op。
 */
export async function purgeExpiredSessions(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const result = await prisma.session.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * 保持期限を過ぎた Verification（Better Auth のトークン等）を削除する。
 */
export async function purgeExpiredVerifications(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const result = await prisma.verification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * 予約終了時刻から `months` を経過した予約について guest 情報を NULL 化する。
 *
 * - 対象は endTime + months < now の予約のみ（未来予約・進行中予約は触らない）
 * - guest 系フィールドのいずれかが非 null の行のみ更新（idempotent）
 * - Customer 紐付き予約は customerId が残るため attribution は保持される
 * - `guestCustomerType` (enum) は個別の識別情報を含まないため保持する
 */
export async function anonymizeExpiredGuestReservations(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const result = await prisma.reservation.updateMany({
    where: {
      endTime: { lt: cutoff },
      OR: [
        { guestLastName: { not: null } },
        { guestFirstName: { not: null } },
        { guestEmail: { not: null } },
        { guestPhone: { not: null } },
        { guestCompanyName: { not: null } },
      ],
    },
    data: {
      guestLastName: null,
      guestFirstName: null,
      guestEmail: null,
      guestPhone: null,
      guestCompanyName: null,
      // 自由記入の「備考」にも PII が入る（監査 F-116）。退会経路と揃える。
      notes: null,
    },
  });
  return result.count;
}

/**
 * 保持期限を過ぎた**ゲスト**イベント申込の PII を匿名化する。
 *
 * ## なぜ会員を対象にしないか
 *
 * 会員申込（`customerId` 非 null）の氏名・連絡先は
 * `anonymizeCustomerCommand` が Customer の退会・匿名化に連動して消す
 * （`customer-lifecycle-commands.ts` の `eventRegistration.updateMany`）。
 * 一方**公開申込のゲストは `customerId = null`** なのでその経路に一切乗らず、
 * ここが唯一の消去経路になる。
 *
 * これが無い間、同じ人物に対して「予約なら 12 ヶ月で消えるがイベント申込は
 * 永久に残る」という説明できない非対称が成立していた。
 *
 * ## 判定基準
 *
 * `slot.endAt`（申込先の時間枠が終わった時刻）を起点にする。
 * `createdAt` を起点にすると、半年先のイベントに早く申し込んだ人ほど早く
 * 匿名化されて当日の受付名簿から名前が消える。
 *
 * ## 冪等性
 *
 * `name` は NOT NULL なので placeholder を入れる。既に匿名化済みの行は
 * 「placeholder 以外の name」「非 null の email / phone / note」のどれも
 * 満たさないので OR 条件から外れ、二度目以降の実行で件数に載らない。
 */
export async function anonymizeExpiredGuestEventRegistrations(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const result = await prisma.eventRegistration.updateMany({
    where: {
      customerId: null,
      slot: { endAt: { lt: cutoff } },
      OR: [
        { name: { not: CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME } },
        { email: { not: null } },
        { phone: { not: null } },
        { note: { not: null } },
      ],
    },
    data: {
      name: CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME,
      email: null,
      phone: null,
      // 自由記入欄。アレルギー・同伴者名など第三者の PII も入る。
      note: null,
    },
  });
  return result.count;
}

/**
 * 保持期限を過ぎた Inquiry を hard delete する。
 *
 * Inquiry は subject / message にも PII が入り得るため partial NULL 化ではなく完全削除する。
 * customer 紐付きは onDelete: SetNull ではなく単純に inquiry を消すだけ（customer は保持）。
 *
 * ## soft delete との関係 (Medium #23, Phase 1)
 *
 * Inquiry Overhaul Phase 1 で `deletedAt` (soft delete) を導入した。admin UI の
 * 「削除」は soft delete で `deletedAt` に now() を刻むだけとなり、**本 cron が
 * hard delete を実行する唯一の経路**になる。
 *
 * Phase 1 minimum の WHERE 条件は 2 分岐の OR で構成する:
 *
 * - `createdAt < cutoff`: 従来通り「作成後 N ヶ月経過」で hard delete する retention 経路。
 *   live のまま放置されているものも soft-deleted も両方対象になる（deleteMany は
 *   deletedAt を暗黙にフィルタしないため cascade 契約は変わらない）
 * - `deletedAt < cutoff`: soft-deleted から N ヶ月経過したものは createdAt が cutoff より
 *   新しくても hard delete する。運用上 admin が最近作成された inquiry を早めに
 *   soft-delete した場合に、retention 経路（createdAt < cutoff）だけでは purge されない
 *   ケースをカバーする
 *
 * Phase 6 で soft-deleted 用の短い grace period（例: 14 日）を config field として
 * 分離する余地は残しつつ、Phase 1 では単一の inquiryMonths cutoff を両分岐で共有する。
 *
 * ## 添付ファイル (inquiry-overhaul completion design §5.2)
 *
 * `inquiry_attachments` は `Inquiry` に `onDelete: Cascade` で紐づくため DB 行は
 * 自動で消えるが、private R2 bucket 上の object は別途明示的に削除しないと
 * orphan で残り続ける。DB cascade が実行される**前**に対象 inquiry 群の
 * `r2Key` を集めておき、DB delete 後に一括削除する。R2 削除が失敗しても
 * DB purge 自体は完了させ（本 cron の主目的）、失敗は log のみ（orphan object
 * の再クリーンアップは別 cron 検討、Phase 1 では対象外 — 環境変数
 * `R2_INQUIRIES_BUCKET_NAME` が未配線の環境でもこの cron 全体を落とさない
 * ためにも try/catch で隔離する）。
 */
export async function purgeExpiredInquiries(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const purgeWhere: Prisma.InquiryWhereInput = {
    OR: [{ createdAt: { lt: cutoff } }, { deletedAt: { lt: cutoff } }],
  };

  const attachments = await prisma.inquiryAttachment.findMany({
    where: { inquiry: purgeWhere },
    select: { r2Key: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('myrrh.inquiry_status_history_mutation_bypass', 'purge', true)`;
    return tx.inquiry.deleteMany({ where: purgeWhere });
  });

  if (attachments.length > 0) {
    try {
      const bucket = getR2InquiriesBucketName();
      const r2Result = await deleteObjectsFromBucket(
        bucket,
        attachments.map((a) => a.r2Key),
      );
      if (!r2Result.success) {
        logError(new Error(r2Result.error ?? "R2 delete failed"), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: "purgeExpiredInquiries.r2Cleanup",
            count: attachments.length,
          },
        });
      }
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "purgeExpiredInquiries.r2Cleanup",
          count: attachments.length,
        },
      });
    }
  }

  return result.count;
}

/**
 * status=INACTIVE かつ最終アクティビティが `months` を経過した Customer の PII を匿名化する。
 *
 * ## 「最終アクティビティ」の判定（Codex #3564864835 → #3564883654 → #3564905126 の deep-dive を反映）
 *
 * `Customer.lastReservationAt` は cached stat であり、`updateAdminReservationCommand`
 * の予約再割当経路で新 customer の値が再計算されない bug が別途ある。cache に依存すると:
 *
 * - stale `null` の customer は「予約履歴なし」と誤判定される（#3564864835）
 * - `AND: [null, createdAt, reservations.none({})]` の guard で修正しても、reassigned
 *   old reservations を持つ customer が両枝で false になり永久放置される（#3564905126）
 *
 * 対策: cache 値を判定に使わず、**Reservation 実履歴** で「recent/upcoming な予約があるか」を
 * 直接問う。cutoff より新しい endTime を持つ予約が **1 件も無い** customer を dormant と定義する。
 * この relation filter は Reservation.customerId の @@index で per-customer subquery が高速。
 *
 *   WHERE status = 'INACTIVE'
 *     AND email NOT LIKE 'anonymized-%'
 *     AND createdAt < cutoff                      -- fresh install 直後の customer を除外
 *     AND NOT EXISTS (SELECT 1 FROM reservations  -- recent/upcoming 予約 0 件
 *                     WHERE customerId = c.id AND endTime >= cutoff)
 *
 * この semantics で全 stale-stat パターンが correct になる:
 *
 * - `lastReservationAt=null` かつ実履歴 0 件: 匿名化対象
 * - `lastReservationAt=null` かつ実履歴が全て cutoff 以前: 匿名化対象
 * - `lastReservationAt=null` かつ recent/upcoming 予約あり: **保持**（cache 参照せず）
 * - stale-high (`lastReservationAt < cutoff` だが実は recent 予約あり): **保持**
 * - fresh installed customer (createdAt >= cutoff): 保持
 *
 * ## 匿名化は `anonymizeCustomerCommand` に委譲する
 *
 * 以前はここに**独自の update** を書いていた。同じ「顧客を匿名化する」なのに
 * 契約が食い違っていた:
 *
 * - `anonymizedAt` / `anonymizedReason` を刻まなかった（＝匿名化済みかどうかを
 *   他の経路から判定できず、冪等判定を `email NOT LIKE 'anonymized-%'` という
 *   **placeholder の綴り**に頼っていた）
 * - `lastNameKana` / `firstNameKana` / `companyName` / `notes` / `isActive` /
 *   `marketingOptIn` / `phoneContactOptIn` / `userId` を残した
 * - Better Auth の User を消さず、連携 Inquiry も匿名化しなかった
 * - placeholder の綴りも `anonymized-<uuid>@myrrh-anon.invalid` と
 *   `deleted+<id>@anonymized.local` で 2 種類あった
 *
 * **同じ意味の操作を 2 本持つと、必ず片方だけ育つ。** 実装を 1 本にした。
 *
 * Customer は他テーブルとの参照が多く（Reservation.customerId 等）、完全削除は
 * attribution 破壊を招く。PII 匿名化で個情法 22 条の目的を達成しつつ会計参照を保持する。
 */
export async function anonymizeInactiveCustomers(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const targets = await prisma.customer.findMany({
    where: {
      status: CustomerStatus.INACTIVE,
      // 冪等判定は placeholder の綴りではなく証跡列で行う。綴りに頼ると、
      // placeholder の形式を変えた瞬間に全件が再匿名化対象になる。
      anonymizedAt: null,
      createdAt: { lt: cutoff },
      // 予約の実履歴を relation filter で直接問う (cached stat は使わない)。
      // cutoff より新しい endTime を持つ予約が 1 件でもある customer は「dormant」ではない。
      reservations: { none: { endTime: { gte: cutoff } } },
    },
    select: { id: true },
  });

  if (targets.length === 0) return 0;

  let updated = 0;
  for (const target of targets) {
    try {
      const anonymized = await anonymizeCustomerCommand({
        customerId: target.id,
        reason: "data-retention",
      });
      await createAuditLogRecord({
        action: AuditAction.UPDATE,
        resource: "customer.anonymization",
        resourceId: anonymized.customerId,
        newValue: {
          reason: anonymized.reason,
          anonymizedAt: anonymized.anonymizedAt.toISOString(),
          hadUserId: anonymized.hadUserId,
          preservedSuppression: anonymized.preservedSuppression,
          anonymizedFields: ANONYMIZED_CUSTOMER_FIELDS,
          anonymizedInquiryIds: anonymized.anonymizedInquiryIds,
        },
        metadata: { triggeredBy: "data-retention-cron" },
      });
      updated += 1;
    } catch (error) {
      // 直前の findMany から実行までの間に別経路が匿名化した場合は CONFLICT。
      // cron 全体を止める理由にはならないので、その 1 件だけ飛ばす。
      if (error instanceof DomainError && error.code === "CONFLICT") continue;
      throw error;
    }
  }
  return updated;
}

/**
 * 全 7 テーブルの purge を順次実行して結果サマリを返す。
 *
 * 呼び出し側（cron route）は feature module `data-retention` が ON のときだけ
 * この関数を呼ぶ。個別 field の月数 0 opt-out は各 purge 関数内で判定される。
 */
export async function runDataRetentionPurge(
  now: Date,
  config: DataRetentionConfig,
): Promise<DataRetentionPurgeResult> {
  const [
    sessionsDeleted,
    verificationsDeleted,
    reservationGuestFieldsAnonymized,
    eventRegistrationGuestFieldsAnonymized,
    inquiriesDeleted,
    customersAnonymized,
  ] = await Promise.all([
    purgeExpiredSessions(now, config.sessionMonths),
    purgeExpiredVerifications(now, config.verificationMonths),
    anonymizeExpiredGuestReservations(now, config.reservationGuestMonths),
    anonymizeExpiredGuestEventRegistrations(
      now,
      config.eventRegistrationGuestMonths,
    ),
    purgeExpiredInquiries(now, config.inquiryMonths),
    anonymizeInactiveCustomers(now, config.customerInactiveMonths),
  ]);

  return {
    sessionsDeleted,
    verificationsDeleted,
    reservationGuestFieldsAnonymized,
    eventRegistrationGuestFieldsAnonymized,
    inquiriesDeleted,
    customersAnonymized,
  };
}
