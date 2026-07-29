import "server-only";

import {
  CustomerStatus,
  CustomerType,
  EmailDeliveryStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import {
  hashSuppressedEmailCandidate,
  isSuppressedDeliveryStatus,
} from "@/shared/domain/customers/queries";
import { recomputeCustomerReservationStats } from "@/shared/domain/reservations/payloads";
import type { CustomerFormData } from "@/shared/lib/validations/customer";

const GUEST_EMAIL_DUPLICATE_MESSAGE =
  "同じメールアドレスの未リンク顧客が既に存在します。既存顧客を編集するか、顧客マージを行ってください。";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function ensureCustomerExists(
  id: string,
): Promise<{ id: string; userId: string | null }> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!customer) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  return customer;
}

async function ensureGuestEmailAvailable(
  email: string,
  currentId?: string,
): Promise<void> {
  const duplicate = await prisma.customer.findFirst({
    where: {
      emailCanonical: normalizeEmailForIdentity(email),
      userId: null,
      ...(currentId ? { NOT: { id: currentId } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new DomainError(GUEST_EMAIL_DUPLICATE_MESSAGE, "CONFLICT");
  }
}

function toCustomerData(data: CustomerFormData) {
  return {
    lastName: data.lastName,
    firstName: data.firstName,
    lastNameKana: data.lastNameKana || null,
    firstNameKana: data.firstNameKana || null,
    companyName: data.companyName || null,
    customerType: data.customerType ?? CustomerType.PERSONAL,
    email: data.email,
    emailCanonical: normalizeEmailForIdentity(data.email),
    phoneNumber: data.phoneNumber || null,
    postalCode: data.postalCode || null,
    prefecture: data.prefecture || null,
    city: data.city || null,
    streetAddress: data.streetAddress || null,
    building: data.building || null,
    notes: data.notes || null,
    marketingOptIn: data.marketingOptIn,
    phoneContactOptIn: data.phoneContactOptIn,
  };
}

export async function createCustomer(
  data: CustomerFormData,
): Promise<{ id: string }> {
  await ensureGuestEmailAvailable(data.email);

  try {
    const customer = await prisma.customer.create({
      data: {
        ...toCustomerData(data),
        status: CustomerStatus.NEW,
        isActive: true,
      },
    });

    return { id: customer.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DomainError(GUEST_EMAIL_DUPLICATE_MESSAGE, "CONFLICT");
    }
    throw error;
  }
}

export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<{ previousStatus: CustomerStatus }> {
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  await prisma.customer.update({
    where: { id },
    data: { status },
  });

  return { previousStatus: existing.status };
}

export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<{ previousNotes: string | null }> {
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { notes: true },
  });
  if (!existing) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  await prisma.customer.update({
    where: { id },
    data: { notes },
  });

  return { previousNotes: existing.notes };
}

export async function toggleCustomerActive(
  id: string,
): Promise<{ previousActive: boolean }> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!customer) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  await prisma.customer.update({
    where: { id },
    data: { isActive: !customer.isActive },
  });

  return { previousActive: customer.isActive };
}

export async function updateCustomer(
  id: string,
  data: CustomerFormData,
): Promise<{
  previous: ReturnType<typeof toCustomerData>;
  /** emailCanonical が変わったか。呼び出し側で SUPPRESSED_EMAILS を invalidate する判定に使う。 */
  emailChanged: boolean;
  /** 旧メールの suppression hash を持ち越したか。 */
  preservedSuppression: boolean;
}> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      userId: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
      firstNameKana: true,
      companyName: true,
      customerType: true,
      email: true,
      emailCanonical: true,
      phoneNumber: true,
      postalCode: true,
      prefecture: true,
      city: true,
      streetAddress: true,
      building: true,
      notes: true,
      marketingOptIn: true,
      phoneContactOptIn: true,
      emailDeliveryStatus: true,
      suppressedEmailHash: true,
    },
  });
  if (!customer) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  if (customer.userId === null) {
    await ensureGuestEmailAvailable(data.email, id);
  }

  const nextCanonical = normalizeEmailForIdentity(data.email);
  const emailChanged = customer.emailCanonical !== nextCanonical;

  // Clean break: メール変更時は新アドレスの delivery を OK にリセットし、
  // 旧アドレスが HARD_BOUNCED / COMPLAINED なら suppressedEmailHash に恒久保存する。
  // 旧実装は status を引き継ぐため、新アドレスが誤抑止されたり旧アドレス抑制が失われたりした。
  let preservedSuppression = false;
  let emailChangePatch: {
    emailDeliveryStatus: EmailDeliveryStatus;
    emailDeliveryUpdatedAt: Date;
    emailDeliveryReason: null;
    suppressedEmailHash?: string;
  } | null = null;

  if (emailChanged) {
    const hashToPreserve =
      customer.suppressedEmailHash ??
      (isSuppressedDeliveryStatus(customer.emailDeliveryStatus)
        ? hashSuppressedEmailCandidate(customer.emailCanonical)
        : null);
    preservedSuppression = hashToPreserve !== null;
    emailChangePatch = {
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      emailDeliveryUpdatedAt: new Date(),
      emailDeliveryReason: null,
      ...(hashToPreserve !== null
        ? { suppressedEmailHash: hashToPreserve }
        : {}),
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id },
        data: {
          ...toCustomerData(data),
          ...(emailChangePatch ?? {}),
        },
      });

      // 連携済み User の login email も同一 tx で同期（mypage / Better Auth と乖離させない）。
      if (customer.userId !== null && emailChanged) {
        await tx.user.update({
          where: { id: customer.userId },
          data: { email: data.email },
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DomainError(GUEST_EMAIL_DUPLICATE_MESSAGE, "CONFLICT");
    }
    throw error;
  }

  const {
    userId: _userId,
    emailDeliveryStatus: _eds,
    suppressedEmailHash: _seh,
    ...previous
  } = customer;
  return { previous, emailChanged, preservedSuppression };
}

/** 顧客が自身のプロフィールを更新（userId ベース）
 *
 * email はこの command では書き込まない。初回 email 登録は
 * `requestCustomerEmailChangeCommand` → verification URL クリック →
 * `consumeCustomerEmailChangeCommand` の 3 段階でのみ Customer.email に反映される。
 */
export async function updateCustomerProfileByUserId(
  userId: string,
  data: {
    customerType: CustomerType;
    lastName: string;
    firstName: string;
    companyName: string | null;
    phoneNumber: string | null;
    marketingOptIn: boolean;
  },
): Promise<void> {
  await prisma.customer.update({
    where: { userId },
    data: {
      customerType: data.customerType,
      lastName: data.lastName,
      firstName: data.firstName,
      companyName: data.companyName,
      phoneNumber: data.phoneNumber,
      marketingOptIn: data.marketingOptIn,
    },
  });
}

/**
 * List-Unsubscribe / one-click 解除用。`marketingOptIn` を false にする（冪等）。
 *
 * - 顧客が存在しない → `null`（呼び出し側は 200 ack。enumeration を避ける）
 * - 既に false → `{ previous: false }` のまま更新行は実質 no-op 相当
 */
export async function optOutCustomerMarketingById(
  customerId: string,
): Promise<{ previous: boolean } | null> {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, marketingOptIn: true },
  });
  if (!existing) return null;

  if (existing.marketingOptIn) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { marketingOptIn: false },
    });
  }

  return { previous: existing.marketingOptIn };
}

/** 予約のゲスト入力値で顧客情報を更新 */
export async function updateCustomerFromGuestData(
  customerId: string,
  guestData: {
    lastName: string;
    firstName: string;
    phoneNumber: string | null;
    companyName: string | null;
  },
): Promise<void> {
  await ensureCustomerExists(customerId);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      lastName: guestData.lastName,
      firstName: guestData.firstName,
      phoneNumber: guestData.phoneNumber,
      companyName: guestData.companyName,
    },
  });
}

/**
 * 状態遷移の保護マトリクス（L1）。
 *
 * key = これから書き込もうとする status、value = 「その status で上書きしては
 * いけない既存 status」の配列。
 *
 * - COMPLAINED は最強（受信者本人の spam 報告シグナル）。何にも上書きさせない。
 * - HARD_BOUNCED は SOFT_BOUNCED を上書き可、ただし COMPLAINED は保護。
 * - SOFT_BOUNCED は HARD_BOUNCED / COMPLAINED どちらも保護（旧実装と同等）。
 * - OK（明示リセット）は現状 admin UI 経由のみで本 write 経路には来ない。
 *
 * これにより Resend が古い bounce webhook を re-deliver した際に、新しい
 * COMPLAINED を古い HARD_BOUNCED が clobber する事故を防ぐ。
 */
const PROTECTED_BY: Record<EmailDeliveryStatus, EmailDeliveryStatus[]> = {
  [EmailDeliveryStatus.OK]: [],
  [EmailDeliveryStatus.SOFT_BOUNCED]: [
    EmailDeliveryStatus.HARD_BOUNCED,
    EmailDeliveryStatus.COMPLAINED,
  ],
  [EmailDeliveryStatus.HARD_BOUNCED]: [EmailDeliveryStatus.COMPLAINED],
  [EmailDeliveryStatus.COMPLAINED]: [],
};

/**
 * Resend Webhook (email.bounced / email.complained) から配信状態を更新する。
 *
 * - email が DB の Customer に紐づかない場合は no-op（unknown 宛先）。
 * - 状態遷移の保護は `PROTECTED_BY` マトリクスに従う（COMPLAINED > HARD_BOUNCED
 *   > SOFT_BOUNCED > OK の強さ順、L1）。
 * - 同 email に紐づく Customer が複数（履歴・テスト由来）なら `updateMany` で全件更新。
 *
 * @returns 更新行数（0 = 該当顧客なし / 1+ = 更新済み）
 */
export async function updateCustomerEmailDeliveryStatusByEmail(
  email: string,
  status: EmailDeliveryStatus,
  reason: string | null,
): Promise<number> {
  const emailCanonical = normalizeEmailForIdentity(email);
  // L1 (PR #1270): 状態遷移の保護マトリクス。
  // COMPLAINED は誰にも上書き不可、HARD_BOUNCED は COMPLAINED のみ保護、
  // SOFT_BOUNCED は HARD_BOUNCED / COMPLAINED 両方を保護。旧実装 (main) の
  // 「SOFT_BOUNCED のみ inline gate」より広くカバーする。
  // OK へのリセット (`resetCustomerEmailDeliveryStatusCommand`) は管理 UI 経由。
  const protectedStates: EmailDeliveryStatus[] = PROTECTED_BY[status];

  const result = await prisma.customer.updateMany({
    where: {
      emailCanonical,
      ...(protectedStates.length > 0
        ? { emailDeliveryStatus: { notIn: protectedStates } }
        : {}),
    },
    data: {
      emailDeliveryStatus: status,
      emailDeliveryUpdatedAt: new Date(),
      emailDeliveryReason: reason?.slice(0, 500) ?? null,
    },
  });

  return result.count;
}

/**
 * RESEND-AUDIT M8: 管理者が Customer.emailDeliveryStatus を OK にリセットする。
 *
 * Resend Webhook が `HARD_BOUNCED` / `COMPLAINED` を書き込むと、当該顧客は
 * `getSuppressedEmailSet()` 経由で全メール送信から除外される (予約確認・
 * 領収書・リマインダー含む)。DNS 一時障害や誤配信で終端状態が付いてしまった
 * 正規顧客を復旧させる唯一のパスがこの command。
 *
 * 契約:
 * - 既に `OK` の顧客に対する呼び出しは no-op として `{ previous: OK }` を返す
 *   (冪等 — action 側が `!== OK` で AuditLog をゲートできるようにする)。
 * - `emailDeliveryUpdatedAt` はリセット時刻で上書き、`emailDeliveryReason` は
 *   null に戻す (旧 bounce reason を残さない)。
 * - AuditLog 書込は行わない。actor userId / ip / userAgent を持つ Server Action
 *   側 (`resetCustomerEmailDelivery`) の afterSuccess で `previous` 付き詳細ログを
 *   残す (event-waitlist と同型)。
 * - 呼び出し側は `SUPPRESSED_EMAILS` cache tag を invalidate すること
 *   (sendEmail の suppression 判定を即時反映するため)。
 */
export async function resetCustomerEmailDeliveryStatusCommand(
  customerId: string,
): Promise<{ previous: EmailDeliveryStatus }> {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, emailDeliveryStatus: true },
  });

  if (!existing) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  if (existing.emailDeliveryStatus === EmailDeliveryStatus.OK) {
    return { previous: EmailDeliveryStatus.OK };
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      emailDeliveryUpdatedAt: new Date(),
      emailDeliveryReason: null,
    },
  });

  return { previous: existing.emailDeliveryStatus };
}

/**
 * 顧客の予約統計を、現在の deleted でない予約レコードから再計算する。
 * 手動トリガーまたは統計異常時の矯正用。
 *
 * transaction を自身で開始するため、admin action 層から直接呼び出し可能。
 */
export async function recomputeCustomerStatsCommand(
  customerId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!existing) {
      throw new DomainError("顧客が見つかりません", "NOT_FOUND");
    }

    await recomputeCustomerReservationStats(tx, customerId);
  });
}

// ---------------------------------------------------------------------------
// Owned modules (thin re-exports for existing call sites / mocks)
// ---------------------------------------------------------------------------

export {
  requestCustomerEmailChangeCommand,
  validateCustomerEmailChangeTokenCommand,
  consumeCustomerEmailChangeCommand,
} from "@/shared/domain/customers/customer-email-change-commands";

export {
  anonymizeCustomerCommand,
  mergeCustomerCommand,
  type AnonymizeCustomerReason,
} from "@/shared/domain/customers/customer-lifecycle-commands";

export {
  consumeCustomerMergeTokenCommand,
  CUSTOMER_MERGE_TOKEN_TTL_MS,
  findUnlinkedGuestCustomerForMember,
  getCustomerMergePreviewForGuest,
  requestCustomerMergeCommand,
  validateCustomerMergeTokenCommand,
  type CustomerMergePreview,
} from "@/shared/domain/customers/customer-merge-commands";
