import "server-only";

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

/** 顧客が自身のプロフィールを更新（userId ベース） */
export async function updateCustomerProfileByUserId(
  userId: string,
  data: {
    customerType: CustomerType;
    lastName: string;
    firstName: string;
    companyName: string | null;
    phoneNumber: string | null;
    /**
     * 初回 email 登録用 (LINE OAuth で email scope 未付与顧客の詰み状態解消)。
     * `null` = 変更なし。string = 現在の Customer.email が空文字/null のとき **のみ** 適用可。
     * 既に email 設定済みの顧客に対する変更は verification 経由の Better Auth
     * changeEmail が canonical で、この関数の scope 外 (別 command として将来追加予定)。
     *
     * SETTINGS-02: 初回登録時も所有権検証は本来必須 (verification email flow) だが、
     * まず uniqueness チェックのみを強制して「第三者の email を Customer.email に設定
     * できる」問題を塞ぐ。完全な verification flow (Better Auth changeEmail 相当の
     * PendingEmailChange + token + Resend send) は followup PR で実装する。
     */
    email?: string | null;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.customer.findUniqueOrThrow({
      where: { userId },
      select: { id: true, email: true },
    });

    // email 初回登録: 現在 email が空 かつ 新 email が有効値のとき **のみ** 適用
    const shouldRegisterEmail =
      data.email !== null &&
      data.email !== undefined &&
      data.email !== "" &&
      (current.email === null ||
        current.email === undefined ||
        current.email === "");

    if (
      data.email !== null &&
      data.email !== undefined &&
      data.email !== "" &&
      !shouldRegisterEmail
    ) {
      throw new DomainError(
        "メールアドレスの変更は本人確認メールを経由して行う必要があります (未実装)",
        "VALIDATION",
      );
    }

    // SETTINGS-02: 初回登録時 uniqueness チェック。
    // 所有権検証 (verification link 経由) は followup PR で実装するが、
    // uniqueness チェックだけでも「第三者の既存 email を Customer.email に
    // 設定できる」問題は塞げる (登録済み email は攻撃者が奪えなくなる)。
    // 検証範囲は Better Auth の User.email (canonical 認証 identity) と
    // 他 Customer の emailCanonical (未リンク guest 顧客含む) の両方。
    if (shouldRegisterEmail && data.email) {
      const canonical = normalizeEmailForIdentity(data.email);

      // 1. Better Auth User.email との衝突チェック (現ユーザー自身は除外)
      const conflictingUser = await tx.user.findFirst({
        where: {
          email: { equals: canonical, mode: "insensitive" },
          NOT: { id: userId },
        },
        select: { id: true },
      });
      if (conflictingUser) {
        throw new DomainError(
          "このメールアドレスは既に使用されています",
          "CONFLICT",
        );
      }

      // 2. 他 Customer.emailCanonical との衝突チェック (自レコードは除外)
      const conflictingCustomer = await tx.customer.findFirst({
        where: {
          emailCanonical: canonical,
          NOT: { id: current.id },
        },
        select: { id: true },
      });
      if (conflictingCustomer) {
        throw new DomainError(
          "このメールアドレスは既に使用されています",
          "CONFLICT",
        );
      }
    }

    try {
      await tx.customer.update({
        where: { userId },
        data: {
          customerType: data.customerType,
          lastName: data.lastName,
          firstName: data.firstName,
          companyName: data.companyName,
          phoneNumber: data.phoneNumber,
          ...(shouldRegisterEmail && data.email
            ? {
                email: data.email,
                emailCanonical: normalizeEmailForIdentity(data.email),
              }
            : {}),
        },
      });
    } catch (error) {
      // race condition (findFirst 後・update 前に他 tx が同 email を挿入) 対応。
      // Customer.emailCanonical は unique index を持たないため P2002 は基本
      // User.email 側で起こるが、将来の unique 化にも耐える防御的キャッチ。
      if (isUniqueConstraintError(error)) {
        throw new DomainError(
          "このメールアドレスは既に使用されています",
          "CONFLICT",
        );
      }
      throw error;
    }

    // 注: Better Auth の User.email は auth plugin が独立管理する契約のため、
    // ここでは Customer.email のみを更新する (reservation 通知等の customer-facing
    // 用途に使うのは Customer.email 側)。User.email の同期は Better Auth の
    // changeEmail plugin (verification 経由) が canonical で、別 PR で対応予定。
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
