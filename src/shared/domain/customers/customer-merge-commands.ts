import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import { mergeCustomerCommand } from "@/shared/domain/customers/customer-lifecycle-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

/** verification token の TTL (1 時間)。email テンプレの文言と揃える。 */
export const CUSTOMER_MERGE_TOKEN_TTL_MS = 60 * 60 * 1000;

/** URL に載せる raw token の byte 長 → base64url 43 文字。 */
const CUSTOMER_MERGE_TOKEN_BYTES = 32;

const VERIFICATION_INVALID_MESSAGE =
  "確認 URL が無効か有効期限が切れています。マイページから再度統合をリクエストしてください。";

const VERIFICATION_ALREADY_APPLIED_MESSAGE =
  "この確認 URL は既に使用済みです。";

export type CustomerMergePreview = {
  guestEmail: string;
  reservationCount: number;
  inquiryCount: number;
  reviewCount: number;
  registrationCount: number;
};

function hashCustomerMergeToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function loadMergeCustomers(
  targetCustomerId: string,
  sourceCustomerId: string,
) {
  if (targetCustomerId === sourceCustomerId) {
    throw new DomainError("同じ顧客を統合することはできません", "VALIDATION");
  }

  const [target, source] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: targetCustomerId },
      select: {
        id: true,
        userId: true,
        email: true,
        emailCanonical: true,
        anonymizedAt: true,
      },
    }),
    prisma.customer.findUnique({
      where: { id: sourceCustomerId },
      select: {
        id: true,
        userId: true,
        email: true,
        emailCanonical: true,
        anonymizedAt: true,
      },
    }),
  ]);

  if (!target) {
    throw new DomainError("統合先の顧客が見つかりません", "NOT_FOUND");
  }
  if (!source) {
    throw new DomainError("統合元の顧客が見つかりません", "NOT_FOUND");
  }
  if (target.userId === null) {
    throw new DomainError(
      "統合先は会員アカウントに紐づいている必要があります",
      "VALIDATION",
    );
  }
  if (source.userId !== null) {
    throw new DomainError(
      "統合元は未リンクのゲスト履歴のみ対象です",
      "VALIDATION",
    );
  }
  if (source.anonymizedAt !== null) {
    throw new DomainError("匿名化済みの履歴は統合できません", "VALIDATION");
  }
  if (target.emailCanonical !== source.emailCanonical) {
    throw new DomainError(
      "メールアドレスが一致しない履歴は統合できません",
      "VALIDATION",
    );
  }

  return { target, source };
}

async function countSourceRelations(sourceCustomerId: string) {
  const [reservations, inquiries, reviews, registrations] = await Promise.all([
    prisma.reservation.count({ where: { customerId: sourceCustomerId } }),
    prisma.inquiry.count({ where: { customerId: sourceCustomerId } }),
    prisma.spaceReview.count({ where: { customerId: sourceCustomerId } }),
    prisma.eventRegistration.count({ where: { customerId: sourceCustomerId } }),
  ]);

  return {
    reservationCount: reservations,
    inquiryCount: inquiries,
    reviewCount: reviews,
    registrationCount: registrations,
  };
}

/**
 * verification token を生成し、PendingCustomerMerge 行を差し替え発行する。
 */
export async function requestCustomerMergeCommand(
  targetCustomerId: string,
  sourceCustomerId: string,
): Promise<{ rawToken: string; expiresAt: Date; guestEmail: string }> {
  const { source } = await loadMergeCustomers(
    targetCustomerId,
    sourceCustomerId,
  );
  const guestEmail = source.email ?? source.emailCanonical;

  const rawToken = randomBytes(CUSTOMER_MERGE_TOKEN_BYTES).toString(
    "base64url",
  );
  const tokenHash = hashCustomerMergeToken(rawToken);
  const expiresAt = new Date(Date.now() + CUSTOMER_MERGE_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.pendingCustomerMerge.deleteMany({
      where: { targetCustomerId, consumedAt: null },
    });

    await tx.pendingCustomerMerge.create({
      data: {
        targetCustomerId,
        sourceCustomerId,
        guestEmail,
        tokenHash,
        expiresAt,
      },
    });
  });

  return { rawToken, expiresAt, guestEmail };
}

/**
 * 確認ページ (GET) 用: token を read-only で検証し preview を返す。
 */
export async function validateCustomerMergeTokenCommand(
  rawToken: string,
): Promise<CustomerMergePreview> {
  const tokenHash = hashCustomerMergeToken(rawToken);
  const pending = await prisma.pendingCustomerMerge.findUnique({
    where: { tokenHash },
    select: {
      guestEmail: true,
      sourceCustomerId: true,
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

  const counts = await countSourceRelations(pending.sourceCustomerId);
  return {
    guestEmail: pending.guestEmail,
    ...counts,
  };
}

/**
 * verification URL クリック後の POST: token を突合して mergeCustomerCommand を実行する。
 */
export async function consumeCustomerMergeTokenCommand(
  rawToken: string,
  expectedTargetCustomerId: string,
): Promise<{
  targetCustomerId: string;
  sourceCustomerId: string;
  transferredReservations: number;
  transferredSeries: number;
  transferredInquiries: number;
  transferredReviews: number;
  transferredRegistrations: number;
  preservedSuppression: boolean;
}> {
  const tokenHash = hashCustomerMergeToken(rawToken);

  const pending = await prisma.pendingCustomerMerge.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      targetCustomerId: true,
      sourceCustomerId: true,
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
  if (pending.targetCustomerId !== expectedTargetCustomerId) {
    throw new DomainError(
      "この統合リクエストは現在のログインアカウントでは実行できません",
      "VALIDATION",
    );
  }

  const source = await prisma.customer.findUnique({
    where: { id: pending.sourceCustomerId },
    select: { userId: true, anonymizedAt: true },
  });
  if (!source || source.userId !== null || source.anonymizedAt !== null) {
    throw new DomainError(
      "統合元の状態が変更されたため、この URL は使用できません",
      "VALIDATION",
    );
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.pendingCustomerMerge.findUnique({
      where: { id: pending.id },
      select: { consumedAt: true, expiresAt: true },
    });
    if (!current || current.consumedAt !== null) {
      throw new DomainError(VERIFICATION_ALREADY_APPLIED_MESSAGE, "VALIDATION");
    }
    if (current.expiresAt.getTime() <= Date.now()) {
      throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION");
    }

    await tx.pendingCustomerMerge.update({
      where: { id: pending.id },
      data: { consumedAt: new Date() },
    });
  });

  const merged = await mergeCustomerCommand(
    pending.sourceCustomerId,
    pending.targetCustomerId,
  );

  return {
    targetCustomerId: pending.targetCustomerId,
    sourceCustomerId: pending.sourceCustomerId,
    ...merged,
  };
}

/** guest email canonical 一致の未リンク Customer を 1 件返す。 */
export async function findUnlinkedGuestCustomerForMember(params: {
  readonly memberCustomerId: string;
  readonly email: string;
}): Promise<{ id: string; email: string } | null> {
  if (params.email.length === 0) return null;

  const emailCanonical = normalizeEmailForIdentity(params.email);
  const guest = await prisma.customer.findFirst({
    where: {
      emailCanonical,
      userId: null,
      anonymizedAt: null,
      NOT: { id: params.memberCustomerId },
    },
    select: { id: true, email: true, emailCanonical: true },
  });

  if (!guest) return null;

  return {
    id: guest.id,
    email: guest.email ?? guest.emailCanonical,
  };
}

export async function getCustomerMergePreviewForGuest(
  sourceCustomerId: string,
): Promise<CustomerMergePreview & { guestEmail: string }> {
  const source = await prisma.customer.findUnique({
    where: { id: sourceCustomerId },
    select: { email: true, emailCanonical: true },
  });
  if (!source) {
    throw new DomainError("統合元の顧客が見つかりません", "NOT_FOUND");
  }

  const counts = await countSourceRelations(sourceCustomerId);
  return {
    guestEmail: source.email ?? source.emailCanonical,
    ...counts,
  };
}
