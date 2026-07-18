import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  CustomerStatus,
  CustomerType,
  EmailDeliveryStatus,
} from "@generated/prisma/enums";
import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
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
): Promise<void> {
  await ensureCustomerExists(id);

  await prisma.customer.update({
    where: { id },
    data: { status },
  });
}

export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<void> {
  await ensureCustomerExists(id);

  await prisma.customer.update({
    where: { id },
    data: { notes },
  });
}

export async function toggleCustomerActive(id: string): Promise<void> {
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
}

export async function updateCustomer(
  id: string,
  data: CustomerFormData,
): Promise<void> {
  const customer = await ensureCustomerExists(id);

  if (customer.userId === null) {
    await ensureGuestEmailAvailable(data.email, id);
  }

  try {
    await prisma.customer.update({
      where: { id },
      data: toCustomerData(data),
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DomainError(GUEST_EMAIL_DUPLICATE_MESSAGE, "CONFLICT");
    }
    throw error;
  }
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
    },
  });
}

// =============================================================================
// SETTINGS-02 followup: Email verification for initial Customer.email registration
// =============================================================================

/** verification token の TTL (1 時間)。email テンプレの文言と揃える。 */
const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000;

/** URL に載せる raw token の byte 長 → base64url 43 文字。 */
const EMAIL_CHANGE_TOKEN_BYTES = 32;

const EMAIL_ALREADY_SET_MESSAGE =
  "メールアドレスは既に登録済みです。変更するには別の手続きが必要です。";

const EMAIL_TAKEN_MESSAGE =
  "このメールアドレスは他の顧客が使用しているため登録できません。";

const VERIFICATION_INVALID_MESSAGE =
  "確認 URL が無効か有効期限が切れています。再度メールアドレスを入力してください。";

const VERIFICATION_ALREADY_APPLIED_MESSAGE =
  "この確認 URL は既に使用済みです。";

function hashEmailChangeToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * verification token を生成し、PendingCustomerEmailChange 行を差し替え発行する。
 *
 * - Customer.email が既に非空なら VALIDATION (この command は「初回登録」限定)
 * - Better Auth 側 User.email との衝突 → CONFLICT (main SETTINGS-02 の
 *   canonical 認証 identity レベル check を継承)
 * - 同 canonical の別 Customer (guest / linked 問わず) との衝突 → CONFLICT
 *   (SETTINGS-02: 未リンク顧客への「他人 email 横取り」を塞ぐ)
 * - 既存の未消費 pending 行があれば削除して新規発行 (最新の 1 件だけが有効)
 *
 * verification token は raw のまま呼び出し側 (Server Action) に返す。DB には
 * SHA-256 ハッシュのみ保存し、raw は URL クリック時にのみ突合される
 * (メールクライアント・プロキシ経由でも DB 上の値だけでは URL を再構成できない)。
 */
export async function requestCustomerEmailChangeCommand(
  userId: string,
  newEmail: string,
): Promise<{ rawToken: string; expiresAt: Date; customerId: string }> {
  const trimmed = newEmail.trim();
  if (trimmed.length === 0) {
    throw new DomainError("メールアドレスを入力してください", "VALIDATION");
  }
  const canonical = normalizeEmailForIdentity(trimmed);

  const rawToken = randomBytes(EMAIL_CHANGE_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashEmailChangeToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS);

  return prisma.$transaction(async (tx) => {
    const current = await tx.customer.findUniqueOrThrow({
      where: { userId },
      select: { id: true, email: true },
    });

    if (current.email !== null && current.email !== "") {
      throw new DomainError(EMAIL_ALREADY_SET_MESSAGE, "VALIDATION");
    }

    // 1. Better Auth 側 User.email と衝突するなら CONFLICT。
    //    main の SETTINGS-02 (PR #1217) が canonical 認証 identity レベルの
    //    check を要求しているためここでも継続する。case-insensitive で
    //    比較して大文字混在入力による回避も塞ぐ。
    const conflictingUser = await tx.user.findFirst({
      where: {
        email: { equals: canonical, mode: "insensitive" },
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    // 2. 同 canonical の別 Customer と衝突するなら CONFLICT。
    //    リンク済み・未リンク問わず全 Customer が対象 (main SETTINGS-02 と同じスコープ)。
    const conflictingCustomer = await tx.customer.findFirst({
      where: {
        emailCanonical: canonical,
        NOT: { id: current.id },
      },
      select: { id: true },
    });
    if (conflictingCustomer) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    // 同一顧客の未消費 pending は上書き (最新の 1 件だけを有効にする)。
    await tx.pendingCustomerEmailChange.deleteMany({
      where: { customerId: current.id, consumedAt: null },
    });

    await tx.pendingCustomerEmailChange.create({
      data: {
        customerId: current.id,
        newEmail: trimmed,
        newEmailCanonical: canonical,
        tokenHash,
        expiresAt,
      },
    });

    return { rawToken, expiresAt, customerId: current.id };
  });
}

/**
 * verification URL クリック時: token を突合して Customer.email に反映する。
 *
 * - token 不一致・期限切れ → VALIDATION (`VERIFICATION_INVALID_MESSAGE`)
 * - 既に consumed → VALIDATION (`VERIFICATION_ALREADY_APPLIED_MESSAGE`)
 * - 期間中に他の未リンク顧客がその email を使い始めていた → CONFLICT
 *
 * consumedAt は single-use を強制するため必ずマークする (期限切れ判定より先に
 * トークンを見つけたら再検証は不可 = 期限内 1 回のみ有効)。
 */
export async function consumeCustomerEmailChangeCommand(
  rawToken: string,
): Promise<{ customerId: string; newEmail: string }> {
  const tokenHash = hashEmailChangeToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const pending = await tx.pendingCustomerEmailChange.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        customerId: true,
        newEmail: true,
        newEmailCanonical: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (!pending) {
      throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION");
    }

    if (pending.consumedAt !== null) {
      throw new DomainError(VERIFICATION_ALREADY_APPLIED_MESSAGE, "VALIDATION");
    }

    if (pending.expiresAt.getTime() <= Date.now()) {
      throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION");
    }

    // 現行 Customer 情報 (userId 除外用) を取得。
    const currentCustomer = await tx.customer.findUniqueOrThrow({
      where: { id: pending.customerId },
      select: { userId: true },
    });

    // request 時点で uniqueness を通していても、click までの間に別の Customer /
    // User がその email を使い始める可能性があるため、consume 時に再チェック。
    // scope は request 時と同じ (Better Auth User.email + 全 Customer.emailCanonical)。
    // 自 Customer に紐づく User は self 除外する (LINE OAuth 経由で account link 済みの
    // ケースで自 User.email が偶然一致するのを false-positive にしないため)。
    const userExclusion = currentCustomer.userId
      ? { NOT: { id: currentCustomer.userId } }
      : {};
    const conflictingUser = await tx.user.findFirst({
      where: {
        email: { equals: pending.newEmailCanonical, mode: "insensitive" },
        ...userExclusion,
      },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    const conflictingCustomer = await tx.customer.findFirst({
      where: {
        emailCanonical: pending.newEmailCanonical,
        NOT: { id: pending.customerId },
      },
      select: { id: true },
    });
    if (conflictingCustomer) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    // single-use を先にマーク (Customer.update が失敗しても再クリックは無効化)
    await tx.pendingCustomerEmailChange.update({
      where: { id: pending.id },
      data: { consumedAt: new Date() },
    });

    await tx.customer.update({
      where: { id: pending.customerId },
      data: {
        email: pending.newEmail,
        emailCanonical: pending.newEmailCanonical,
      },
    });

    return { customerId: pending.customerId, newEmail: pending.newEmail };
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await ensureCustomerExists(id);

  await prisma.customer.delete({
    where: { id },
  });
}

/** 顧客マージ: source の全リレーションを target に移管し source を削除 */
export async function mergeCustomerCommand(
  sourceId: string,
  targetId: string,
): Promise<{
  transferredReservations: number;
  transferredInquiries: number;
  transferredReviews: number;
  transferredRegistrations: number;
}> {
  if (sourceId === targetId) {
    throw new DomainError("同じ顧客をマージすることはできません", "VALIDATION");
  }

  const [source, target] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: sourceId },
      select: { id: true },
    }),
    prisma.customer.findUnique({
      where: { id: targetId },
      select: { id: true },
    }),
  ]);
  if (!source)
    throw new DomainError("マージ元の顧客が見つかりません", "NOT_FOUND");
  if (!target)
    throw new DomainError("マージ先の顧客が見つかりません", "NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const [reservations, inquiries, reviews, registrations] = await Promise.all(
      [
        tx.reservation.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.inquiry.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.spaceReview.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.eventRegistration.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
      ],
    );

    // target の予約統計を実履歴から再計算する。
    // 同型の再計算経路は `updateAdminReservationCommand` の予約再割当時にもあり、
    // 実装は `recomputeCustomerReservationStats` に集約されている。
    await recomputeCustomerReservationStats(tx, targetId);

    await tx.customer.delete({ where: { id: sourceId } });

    return {
      transferredReservations: reservations.count,
      transferredInquiries: inquiries.count,
      transferredReviews: reviews.count,
      transferredRegistrations: registrations.count,
    };
  });
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
 * Resend Webhook (email.bounced / email.complained) から配信状態を更新する。
 *
 * - email が DB の Customer に紐づかない場合は no-op（unknown 宛先）。
 * - 既に COMPLAINED の Customer に SOFT_BOUNCED を上書きしない（強い終端状態を保護）。
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
  // 強い終端状態（HARD_BOUNCED / COMPLAINED）は SOFT_BOUNCED で上書きしない。
  // OK へのリセットは管理 UI 経由を想定（本 PR 範囲外）。
  const protectedStates: EmailDeliveryStatus[] =
    status === EmailDeliveryStatus.SOFT_BOUNCED
      ? [EmailDeliveryStatus.HARD_BOUNCED, EmailDeliveryStatus.COMPLAINED]
      : [];

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
