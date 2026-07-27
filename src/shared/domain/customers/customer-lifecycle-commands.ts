import "server-only";

import {
  hashSuppressedEmailCandidate,
  isSuppressedDeliveryStatus,
} from "@/shared/domain/customers/queries";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import { recomputeCustomerReservationStats } from "@/shared/domain/reservations/payloads";

/**
 * STATE-03: 顧客匿名化 (anonymize) command。
 *
 * 決済歴 (Receipt 発行済) のある Customer は物理削除できない
 * (`Reservation.customer` は `onDelete: Cascade`、`Receipt.reservation` は
 * `onDelete: Restrict` のため cascade が Receipt の Restrict でブロックされる)。
 * 物理削除の代わりに PII を placeholder に置換して `anonymizedAt` を刻印し、
 * Reservation / Receipt の customerId 参照を残す (会計証跡・不変性の保全)。
 *
 * 匿名化される列:
 * - email          → `deleted+<customer.id>@anonymized.local` (unique 制約維持)
 * - emailCanonical → 同上
 * - lastName       → "削除済み" (NOT NULL 制約のため placeholder 必須)
 * - firstName      → "" (NOT NULL 制約のため empty string)
 * - lastNameKana / firstNameKana / phoneNumber / companyName / postalCode /
 *   prefecture / city / streetAddress / building / notes → null
 * - isActive       → false (以降ログイン・予約作成不可)
 * - marketingOptIn → false (メール送信不可)
 * - phoneContactOptIn → false
 * - anonymizedAt   → now() (append-only 証跡)
 * - anonymizedReason → input.reason (append-only 証跡)
 * - userId         → null (Better Auth 側 User を切り離す)
 *
 * さらに Better Auth 側 User が紐付いていた場合はその User を削除
 * (Session / Account が onDelete: Cascade で連鎖削除、以降ログイン不可)。
 *
 * Reservation / Receipt / Inquiry / SpaceReview / EventRegistration /
 * TermsAgreement は削除せず customerId 参照を維持する。JOIN で PII に到達しても
 * 全て redacted 値になる。
 *
 * AuditLog: action=UPDATE / resource=customer / oldValue には PII を含めず
 * `{ hadUserId }` のみ、newValue は `{ anonymizedAt, anonymizedReason }`、
 * metadata は `{ source, actorUserId }`。
 *
 * 冪等: 既に anonymizedAt が非 null なら DomainError (`ALREADY_ANONYMIZED`) を throw。
 */
export type AnonymizeCustomerReason =
  "customer-requested" | "admin-purge" | "data-retention";

const CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME = "削除済み";
const CUSTOMER_ANONYMIZE_PLACEHOLDER_FIRST_NAME = "";

function buildAnonymizedEmail(customerId: string): {
  email: string;
  emailCanonical: string;
} {
  const placeholder = `deleted+${customerId}@anonymized.local`;
  return {
    email: placeholder,
    emailCanonical: normalizeEmailForIdentity(placeholder),
  };
}

export async function anonymizeCustomerCommand(input: {
  customerId: string;
  reason: AnonymizeCustomerReason;
  /**
   * Better Auth `deleteUser.beforeDelete` 経路では User 削除は BA 本体が行うため
   * `false` を渡す（二重 delete / FK 競合を避ける）。admin / cron は default `true`。
   * @see https://www.better-auth.com/docs/concepts/users-accounts
   */
  deleteLinkedUser?: boolean;
}): Promise<{
  customerId: string;
  anonymizedAt: Date;
  reason: AnonymizeCustomerReason;
  hadUserId: boolean;
  /** RESEND-AUDIT M7: 匿名化前の suppression 状態を hash として持ち越したか。 */
  preservedSuppression: boolean;
}> {
  const deleteLinkedUser = input.deleteLinkedUser !== false;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        userId: true,
        anonymizedAt: true,
        // RESEND-AUDIT M7: 匿名化前の suppression 状態を保存するため
        // emailCanonical と emailDeliveryStatus を tx 内で pre-read する。
        emailCanonical: true,
        emailDeliveryStatus: true,
      },
    });

    if (!existing) {
      throw new DomainError("顧客が見つかりません", "NOT_FOUND");
    }

    if (existing.anonymizedAt !== null) {
      throw new DomainError("この顧客は既に匿名化済みです", "CONFLICT");
    }

    const anonymizedEmail = buildAnonymizedEmail(existing.id);
    const anonymizedAt = new Date();
    // RESEND-AUDIT M7: HARD_BOUNCED / COMPLAINED の Customer は匿名化後も
    // 送信 suppression が持続する必要がある (再登録した同じ実 email に
    // 送信して sender reputation を悪化させない)。emailCanonical を
    // placeholder に置換する前に、元の canonical の hash を保存しておく。
    const preservedSuppressionHash = isSuppressedDeliveryStatus(
      existing.emailDeliveryStatus,
    )
      ? hashSuppressedEmailCandidate(existing.emailCanonical)
      : null;

    await tx.customer.update({
      where: { id: existing.id },
      data: {
        email: anonymizedEmail.email,
        emailCanonical: anonymizedEmail.emailCanonical,
        lastName: CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME,
        firstName: CUSTOMER_ANONYMIZE_PLACEHOLDER_FIRST_NAME,
        lastNameKana: null,
        firstNameKana: null,
        phoneNumber: null,
        companyName: null,
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        building: null,
        notes: null,
        isActive: false,
        marketingOptIn: false,
        phoneContactOptIn: false,
        userId: null,
        anonymizedAt,
        anonymizedReason: input.reason,
        // suppression 対象でなければ NULL のまま (通常 Customer が anonymize
        // される多数派経路)。suppressedEmailHash は書き換え専用 (再設定なし)。
        ...(preservedSuppressionHash !== null
          ? { suppressedEmailHash: preservedSuppressionHash }
          : {}),
      },
    });

    // Better Auth 側 User (顧客ログイン用) を明示削除する。
    // Session / Account は User に対して onDelete: Cascade のため連鎖削除される。
    // Reservation / AuditLog の userId は User に対して onDelete: SetNull のため
    // 予約履歴・監査証跡は残る。
    // deleteLinkedUser=false のとき（BA beforeDelete）は User 行を残し、
    // deleteUser 本体の物理削除に委譲する。
    if (deleteLinkedUser && existing.userId !== null) {
      await tx.user.delete({ where: { id: existing.userId } });
    }

    return {
      customerId: existing.id,
      anonymizedAt,
      reason: input.reason,
      hadUserId: existing.userId !== null,
      preservedSuppression: preservedSuppressionHash !== null,
    };
  });
}

/** 顧客マージ: source の全リレーションを target に移管し source を削除 */
export async function mergeCustomerCommand(
  sourceId: string,
  targetId: string,
): Promise<{
  transferredReservations: number;
  transferredSeries: number;
  transferredInquiries: number;
  transferredReviews: number;
  transferredRegistrations: number;
  /** RESEND-AUDIT M7: source の suppression を target に持ち越したか。 */
  preservedSuppression: boolean;
}> {
  if (sourceId === targetId) {
    throw new DomainError("同じ顧客をマージすることはできません", "VALIDATION");
  }

  const [source, target] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: sourceId },
      // RESEND-AUDIT M7: source が suppression 状態 (HARD_BOUNCED /
      // COMPLAINED) なら、source を物理削除する前にその emailCanonical hash を
      // target の `suppressedEmailHash` に持ち越す (実 email の suppression が
      // silently 失われないようにする)。既に source が anonymized 済みで
      // suppressedEmailHash を持っているなら、その hash をそのまま持ち越す
      // (再 hash せず「元の実 email」の hash を維持)。
      select: {
        id: true,
        emailCanonical: true,
        emailDeliveryStatus: true,
        suppressedEmailHash: true,
      },
    }),
    prisma.customer.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        emailCanonical: true,
        emailDeliveryStatus: true,
        suppressedEmailHash: true,
      },
    }),
  ]);
  if (!source)
    throw new DomainError("マージ元の顧客が見つかりません", "NOT_FOUND");
  if (!target)
    throw new DomainError("マージ先の顧客が見つかりません", "NOT_FOUND");

  // RESEND-AUDIT M7: source から target へ持ち越す suppression hash を決定する。
  // 優先順:
  //   1. source が既に anonymized で suppressedEmailHash を持つ → その値
  //      (匿名化前の元 emailCanonical の hash が既に保存されている)
  //   2. source の emailDeliveryStatus が suppression 対象 → 現 emailCanonical
  //      を hash 化した値
  //   3. それ以外 → null (持ち越さない)
  //
  // 条件:
  //   - source の hash が target の実 emailCanonical と等価な場合の hash と
  //     一致しない限り、target が既に自分の email で suppression 状態でない
  //     ときのみ書き込む (target 側の既存 emailDeliveryStatus を上書きしない)。
  //   - target が既に suppressedEmailHash を持っている場合は上書きしない
  //     (別の元 email の hash を消してしまわない)。
  //   - target が自分の emailCanonical で suppression 状態のときは書き込まない
  //     (getSuppressedEmailSet で target の emailCanonical hash 経路で既にカバーされる)。
  const sourceSuppressionHash =
    source.suppressedEmailHash !== null
      ? source.suppressedEmailHash
      : isSuppressedDeliveryStatus(source.emailDeliveryStatus)
        ? hashSuppressedEmailCandidate(source.emailCanonical)
        : null;

  const targetOwnHash = hashSuppressedEmailCandidate(target.emailCanonical);
  const targetAlreadySuppressed = isSuppressedDeliveryStatus(
    target.emailDeliveryStatus,
  );

  const shouldPreserveOnTarget =
    sourceSuppressionHash !== null &&
    target.suppressedEmailHash === null &&
    // target 自身の canonical email が既に SUPPRESSED_EMAILS で拾える場合は
    // 別ソースの hash を書く意味が薄い (かつ hash が一致するなら no-op)。
    !(targetAlreadySuppressed && sourceSuppressionHash === targetOwnHash);

  return prisma.$transaction(async (tx) => {
    // interactive tx は単一コネクション。Promise.all での並行発行は禁止。
    const reservations = await tx.reservation.updateMany({
      where: { customerId: sourceId },
      data: { customerId: targetId },
    });
    // ReservationSeries も customer FK は onDelete: Cascade。旧実装はこの
    // updateMany を欠いており、続く tx.customer.delete が source を消した
    // 瞬間に source が保有していた series 行が cascade で物理削除され、
    // その直前で updateMany 済み Reservation.seriesId は seriesId FK の
    // onDelete: SetNull により null に上書きされていた (Round-4 audit
    // Finding #3 / high)。partial unique index
    // `reservation_series_space_dtstart_active_unique` は (spaceId,
    // dtstart) のみが key で customerId を含まないため、customerId 変更
    // だけでは衝突しない。
    const series = await tx.reservationSeries.updateMany({
      where: { customerId: sourceId },
      data: { customerId: targetId },
    });
    const inquiries = await tx.inquiry.updateMany({
      where: { customerId: sourceId },
      data: { customerId: targetId },
    });
    const reviews = await tx.spaceReview.updateMany({
      where: { customerId: sourceId },
      data: { customerId: targetId },
    });
    const registrations = await tx.eventRegistration.updateMany({
      where: { customerId: sourceId },
      data: { customerId: targetId },
    });

    // target の予約統計を実履歴から再計算する。
    // 同型の再計算経路は `updateAdminReservationCommand` の予約再割当時にもあり、
    // 実装は `recomputeCustomerReservationStats` に集約されている。
    await recomputeCustomerReservationStats(tx, targetId);

    // RESEND-AUDIT M7: source を削除する前に、必要なら suppression hash を
    // target に転記する (source と target で email が異なるケースをカバー)。
    if (shouldPreserveOnTarget) {
      await tx.customer.update({
        where: { id: targetId },
        data: { suppressedEmailHash: sourceSuppressionHash },
      });
    }

    await tx.customer.delete({ where: { id: sourceId } });

    return {
      transferredReservations: reservations.count,
      transferredSeries: series.count,
      transferredInquiries: inquiries.count,
      transferredReviews: reviews.count,
      transferredRegistrations: registrations.count,
      preservedSuppression: shouldPreserveOnTarget,
    };
  });
}
