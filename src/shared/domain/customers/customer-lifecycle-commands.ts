import "server-only";

import {
  hashSuppressedEmailCandidate,
  isSuppressedDeliveryStatus,
} from "@/shared/domain/customers/queries";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import {
  anonymizeInquiryInTx,
  deleteInquiryAttachmentR2Keys,
} from "@/shared/domain/inquiries/anonymize-commands";
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
 * TermsAgreement は削除せず customerId 参照を維持する。**参照先が持つ PII も
 * 同じ tx で消す**:
 *
 * - `Reservation` の `guestLastName` / `guestFirstName` / `guestEmail` /
 *   `guestPhone` / `guestCompanyName` → null。公開の予約作成は**ログイン顧客でも
 *   無条件に**これらへ実名・メール・電話・会社名を書くので、Customer 側だけ
 *   redact しても JOIN で素の PII に到達できてしまう
 * - `EventRegistration` の `name` は placeholder、`email` / `phone` / `note` → null。
 *   こちらは `customerId` が `onDelete: SetNull` の弱い参照で、退会後も申込者の
 *   氏名・連絡先が残っていた
 * - `Inquiry` は `anonymizeInquiryInTx` で連鎖匿名化する（下記）
 *
 * TermsAgreement は append-only なので触らない（同意の証跡として `guestEmail` が
 * 残る。法的保存義務が redaction より優先する領域）。
 *
 * **この列挙は散文なので必ず drift する。** 実際の網羅は
 * `__tests__/integration/domain/customers/anonymize-covers-pii.test.ts` が
 * schema から「顧客 PII を持つ列」を導いて突き合わせる。
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
  /** Customer 匿名化に連鎖して anonymize した Inquiry id 一覧。 */
  anonymizedInquiryIds: string[];
}> {
  const deleteLinkedUser = input.deleteLinkedUser !== false;

  const txResult = await prisma.$transaction(async (tx) => {
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
        // **匿名化した顧客は宛先にしない。**
        //
        // placeholder は `@anonymized.local`（RFC 6762 の予約 TLD で MX を持たない）
        // なので、送れば必ず hard bounce する。ここで suppression に載せないと、
        // 退会後も未来の予約が残っているとリマインダ cron が placeholder 宛に送り、
        // bounce → webhook が HARD_BOUNCED を書く → 以後 `reason="suppressed"` で
        // cron が claim を解放し続ける、というループになる（監査 F-112）。
        //
        // 旧アドレスの suppression を持ち越す必要があるならそれを優先する
        // （実アドレスの hash のほうが情報量が多い）。持ち越しが無い場合でも
        // placeholder 自身の hash を入れて、`getSuppressedEmailSet` の母集合に
        // 必ず入るようにする。
        suppressedEmailHash:
          preservedSuppressionHash ??
          hashSuppressedEmailCandidate(anonymizedEmail.emailCanonical),
      },
    });

    // 参照先が持つ PII を同じ tx で消す。Customer 側だけ redact しても、
    // Reservation.guest* / EventRegistration.* に素の氏名・メール・電話が残っていれば
    // JOIN 一発で到達できる（公開の予約作成はログイン顧客でも guest* を埋める）。
    await tx.reservation.updateMany({
      where: { customerId: existing.id },
      data: {
        guestLastName: null,
        guestFirstName: null,
        guestEmail: null,
        guestPhone: null,
        guestCompanyName: null,
        // 自由記入の「備考」にも第三者を含む PII が入る（監査 F-116）。
        // 管理画面の予約詳細・CSV エクスポート・GCal の description に載り続ける。
        notes: null,
      },
    });

    // `name` は NOT NULL なので placeholder を入れる（Customer 側と同じ文言）。
    await tx.eventRegistration.updateMany({
      where: { customerId: existing.id },
      data: {
        name: CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME,
        email: null,
        phone: null,
        note: null,
      },
    });

    // 短命トークン台帳にも素のメールアドレスが載る。**これらは行ごと消す。**
    //
    // 消える経路が 2 つしか無く、どちらも匿名化では発火しない:
    //   - 同じ customerId が再リクエストしたときの deleteMany（退会後は起きない）
    //   - Customer の物理削除に対する onDelete: Cascade（退会は匿名化であって削除ではない）
    //
    // 残すと `customerId` で JOIN するだけで元のアドレスが復元でき、
    // 「退会したのに消えていない」状態になる。`consumedAt` の有無は問わない —
    // 使用済みでも未使用でも、載っているのは実アドレスそのもの。
    await tx.pendingCustomerEmailChange.deleteMany({
      where: { customerId: existing.id },
    });
    await tx.pendingCustomerMerge.deleteMany({
      where: {
        OR: [
          { targetCustomerId: existing.id },
          { sourceCustomerId: existing.id },
        ],
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

    const linkedInquiries = await tx.inquiry.findMany({
      where: {
        customerId: existing.id,
        anonymizedAt: null,
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const anonymizedInquiryIds: string[] = [];
    const deletedR2Keys: string[] = [];

    for (const inquiry of linkedInquiries) {
      const cascadeResult = await anonymizeInquiryInTx(tx, {
        inquiryId: inquiry.id,
        reason: "customer-cascade",
      });
      anonymizedInquiryIds.push(inquiry.id);
      deletedR2Keys.push(...cascadeResult.deletedR2Keys);
    }

    return {
      customerId: existing.id,
      anonymizedAt,
      reason: input.reason,
      hadUserId: existing.userId !== null,
      preservedSuppression: preservedSuppressionHash !== null,
      anonymizedInquiryIds,
      deletedR2Keys,
    };
  });

  await deleteInquiryAttachmentR2Keys({
    r2Keys: txResult.deletedR2Keys,
    operation: "anonymizeCustomerCommand.inquiryCascadeR2Cleanup",
  });

  return {
    customerId: txResult.customerId,
    anonymizedAt: txResult.anonymizedAt,
    reason: txResult.reason,
    hadUserId: txResult.hadUserId,
    preservedSuppression: txResult.preservedSuppression,
    anonymizedInquiryIds: txResult.anonymizedInquiryIds,
  };
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

  const shouldPreserveOnTarget =
    sourceSuppressionHash !== null &&
    target.suppressedEmailHash === null &&
    // **同じアドレスなら書かない。** `targetAlreadySuppressed` の有無を条件に
    // 入れていたため、「ゲスト行が bounce → 同じアドレスで会員登録 → 履歴統合」
    // という正常な流れで、**会員の現用アドレスの hash が恒久 suppression として
    // 焼かれていた**（監査 F-44）。統合でゲスト行は消えるので
    // `emailDeliveryStatus` 経路の抑制は解けるのに、hash 経路だけが残り、
    // 以後その会員宛のメールが全部無言で drop される。
    //
    // 同一アドレスの抑制は target 自身の `emailDeliveryStatus` で表現でき、
    // そちらは管理画面からリセットできる。hash 側にはリセット経路が無い。
    sourceSuppressionHash !== targetOwnHash;

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
    await tx.inquiryReply.updateMany({
      where: { authorCustomerId: sourceId },
      data: { authorCustomerId: targetId },
    });
    await tx.inquiryAttachment.updateMany({
      where: { uploadedByCustomerId: sourceId },
      data: { uploadedByCustomerId: targetId },
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
