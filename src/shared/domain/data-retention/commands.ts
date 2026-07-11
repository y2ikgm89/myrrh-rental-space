import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import {
  parseDataRetentionConfig,
  type DataRetentionConfig,
} from "@/shared/lib/json-validators";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * データ保持ポリシー実行 — PIPA 22 条 / GDPR 5(1)(e) 対応。
 *
 * 6 テーブルを対象に、`Settings.dataRetention` JSON の月数を経過したレコードを
 * 削除または PII 匿名化する。実運用は `/api/cron/data-retention` から呼び出される
 * （feature module `data-retention` の ON/OFF ゲートは cron 側で判定）。
 *
 * ## テーブル別戦略
 *
 * | Table              | Strategy   | 判定基準                                    |
 * | ------------------ | ---------- | ------------------------------------------- |
 * | Session            | DELETE     | createdAt < now - sessionMonths             |
 * | Verification       | DELETE     | createdAt < now - verificationMonths        |
 * | login_attempts     | DELETE     | createdAt < now - loginAttemptMonths        |
 * | Reservation.guest* | NULL 化    | endTime + reservationGuestMonths < now      |
 * | Inquiry            | DELETE     | createdAt < now - inquiryMonths             |
 * | Customer (INACTIVE)| PII 匿名化 | status=INACTIVE ∧ lastReservationAt < now - customerInactiveMonths |
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
  readonly loginAttemptsDeleted: number;
  readonly reservationGuestFieldsAnonymized: number;
  readonly inquiriesDeleted: number;
  readonly customersAnonymized: number;
}

/**
 * Settings singleton から dataRetention JSON を読んで parse する。
 * 存在しない / 不正値 → `DEFAULT_DATA_RETENTION_CONFIG`（fail-safe）。
 */
export async function getDataRetentionConfig(): Promise<DataRetentionConfig> {
  const row = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { dataRetention: true },
  });
  return parseDataRetentionConfig(row?.dataRetention);
}

function monthsAgo(now: Date, months: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
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
 * 保持期限を過ぎた login_attempts を削除する。
 */
export async function purgeExpiredLoginAttempts(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const result = await prisma.loginAttempt.deleteMany({
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
    },
  });
  return result.count;
}

/**
 * 保持期限を過ぎた Inquiry を削除する。
 *
 * Inquiry は subject / message にも PII が入り得るため partial NULL 化ではなく完全削除する。
 * customer 紐付きは onDelete: SetNull ではなく単純に inquiry を消すだけ（customer は保持）。
 */
export async function purgeExpiredInquiries(
  now: Date,
  months: number,
): Promise<number> {
  if (months <= 0) return 0;
  const cutoff = monthsAgo(now, months);
  const result = await prisma.inquiry.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

const ANONYMIZED_EMAIL_DOMAIN = "myrrh-anon.invalid";

function buildAnonymizedEmail(): string {
  return `anonymized-${randomUUID()}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

/**
 * status=INACTIVE かつ最終予約が `months` を経過した Customer の PII を匿名化する。
 *
 * - email / emailCanonical は non-routable な `anonymized-<uuid>@myrrh-anon.invalid` に置換
 *   （UNIQUE 制約を破壊しないため per-record で uuid を発行、複数レコードで衝突しない）
 * - phoneNumber / postalCode / prefecture / city / streetAddress / building は NULL 化
 * - lastName / firstName は保持（予約明細の表示用。氏名単体では容易に個人特定できない）
 * - 二度目以降の実行で再匿名化しないよう `email NOT LIKE 'anonymized-%'` で除外
 *
 * Customer は他テーブルとの参照が多く（Reservation.customerId 等）、完全削除は
 * attribution 破壊を招く。PII 匿名化で個情法 22 条の目的達成しつつ会計参照を保持する。
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
      lastReservationAt: { lt: cutoff },
      email: { not: { startsWith: "anonymized-" } },
    },
    select: { id: true },
  });

  if (targets.length === 0) return 0;

  // per-record で UUID を発行するため updateMany を使えない（同一 email になり
  // emailCanonical UNIQUE 違反）。逐次 update で個別匿名化する。
  let updated = 0;
  for (const target of targets) {
    const anonymizedEmail = buildAnonymizedEmail();
    await prisma.customer.update({
      where: { id: target.id },
      data: {
        email: anonymizedEmail,
        emailCanonical: anonymizedEmail.toLowerCase(),
        phoneNumber: null,
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        building: null,
      },
    });
    updated += 1;
  }
  return updated;
}

/**
 * 全 6 テーブルの purge を順次実行して結果サマリを返す。
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
    loginAttemptsDeleted,
    reservationGuestFieldsAnonymized,
    inquiriesDeleted,
    customersAnonymized,
  ] = await Promise.all([
    purgeExpiredSessions(now, config.sessionMonths),
    purgeExpiredVerifications(now, config.verificationMonths),
    purgeExpiredLoginAttempts(now, config.loginAttemptMonths),
    anonymizeExpiredGuestReservations(now, config.reservationGuestMonths),
    purgeExpiredInquiries(now, config.inquiryMonths),
    anonymizeInactiveCustomers(now, config.customerInactiveMonths),
  ]);

  return {
    sessionsDeleted,
    verificationsDeleted,
    loginAttemptsDeleted,
    reservationGuestFieldsAnonymized,
    inquiriesDeleted,
    customersAnonymized,
  };
}
