import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@generated/prisma/client";
import {
  CustomerType,
  InquiryReplyAuthorType,
  InquiryStatus,
} from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import { INQUIRY_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";

// ============================================================================
// receiptNumber 採番
// ============================================================================

/**
 * "INQ-XXXXXXXX" 形式の受付番号を生成する。8 桁の Base16 uppercase。
 * DB 側 UNIQUE 制約に対し collision で最大 5 回 retry する。
 * 母集団 16^8 = 4,294,967,296 → 100 万件在庫でも新規衝突確率 ~0.02%。
 */
function generateReceiptNumberCandidate(): string {
  const raw = randomUUID().replaceAll("-", "").substring(0, 8).toUpperCase();
  return `INQ-${raw}`;
}

// ============================================================================
// Status transition ガード（Critical #3 / #4 の SSoT）
// ============================================================================

function assertInquiryStatusTransition(
  from: InquiryStatus,
  to: InquiryStatus,
): void {
  if (from === to) return;
  const allowed = INQUIRY_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new DomainError(
      `お問い合わせのステータスを ${from} から ${to} へ変更することはできません`,
      "VALIDATION",
    );
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
  changedById: string | null,
  reason?: string,
): Promise<void> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true, status: true, deletedAt: true },
  });

  if (!inquiry || inquiry.deletedAt !== null) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  if (inquiry.status === status) return;

  assertInquiryStatusTransition(inquiry.status, status);

  // Round-4 audit Finding #11 / high: 旧実装は tx.inquiry.update({where:{id}})
  // で status guard を欠いており、2 admin が同時に NEW→CLOSED / NEW→IN_PROGRESS
  // を選ぶと A が status=CLOSED を commit、B が続けて status=IN_PROGRESS を
  // 上書き commit する結果、実際の runtime 遷移が「CLOSED→IN_PROGRESS」に
  // なる (CLOSED からの遷移先は [] に定義され本来不可能)。updateMany の WHERE
  // 述語に `status: inquiry.status` を含めた claim パターンで再入検知し、
  // count === 0 は CONFLICT DomainError にする (reservation の
  // updateReservationStatusCommand と同型)。
  await prisma.$transaction(async (tx) => {
    const claim = await tx.inquiry.updateMany({
      where: { id, deletedAt: null, status: inquiry.status },
      data: { status },
    });
    if (claim.count === 0) {
      throw new DomainError(
        "別の管理者によりお問い合わせの状態が変更されました。最新の状態を確認してください。",
        "CONFLICT",
      );
    }
    await tx.inquiryStatusHistory.create({
      data: {
        inquiryId: id,
        fromStatus: inquiry.status,
        toStatus: status,
        changedById,
        reason: reason ?? null,
      },
    });
  });
}

export type InquiryReplyEmailContext = {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly receiptNumber: string;
  /**
   * この問い合わせに紐づく Customer の User.id（ログイン可能な実アカウント）。
   * Inquiry.customerId 自体は resolveOrCreateGuestInquiryCustomer が発行する
   * userId=null の「ゲスト shell」customer を指し得るため、マイページ確認リンクの
   * 出し分けには customer.userId（Better Auth 連携済みか）を直接見る必要がある。
   */
  readonly customerUserId: string | null;
};

/**
 * スタッフ返信を InquiryReply に append し、必要なら status を IN_PROGRESS に前進させる。
 *
 * Critical #3 修正: RESOLVED / CLOSED / SPAM 中の inquiry を無条件で
 * IN_PROGRESS に巻き戻すバグを封じる。
 * - 現ステータスが NEW → IN_PROGRESS へ遷移 (INQUIRY_STATUS_TRANSITIONS で許可)
 * - 現ステータスが IN_PROGRESS → 変更しない
 * - 現ステータスが RESOLVED / CLOSED / FLAGGED / SPAM → 返信は許可、status は現状維持
 */
export async function replyToInquiryCommand(
  inquiryId: string,
  replyBody: string,
  userId: string,
): Promise<{
  id: string;
  replyId: string;
  emailContext: InquiryReplyEmailContext;
}> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      name: true,
      email: true,
      subject: true,
      message: true,
      status: true,
      receiptNumber: true,
      deletedAt: true,
      customer: { select: { userId: true } },
    },
  });

  if (!inquiry || inquiry.deletedAt !== null) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  const shouldAdvanceToInProgress = inquiry.status === InquiryStatus.NEW;

  const created = await prisma.$transaction(async (tx) => {
    const reply = await tx.inquiryReply.create({
      data: {
        inquiryId,
        authorType: InquiryReplyAuthorType.STAFF,
        authorId: userId,
        body: replyBody,
      },
      select: { id: true },
    });

    if (shouldAdvanceToInProgress) {
      await tx.inquiry.update({
        where: { id: inquiryId },
        data: { status: InquiryStatus.IN_PROGRESS },
      });
      await tx.inquiryStatusHistory.create({
        data: {
          inquiryId,
          fromStatus: inquiry.status,
          toStatus: InquiryStatus.IN_PROGRESS,
          changedById: userId,
          reason: "reply-advance",
        },
      });
    }

    return reply;
  });

  return {
    id: inquiryId,
    replyId: created.id,
    emailContext: {
      name: inquiry.name,
      email: inquiry.email,
      subject: inquiry.subject,
      message: inquiry.message,
      receiptNumber: inquiry.receiptNumber,
      customerUserId: inquiry.customer?.userId ?? null,
    },
  };
}

/**
 * Inquiry の customer 紐付けを変更する。diff を返り値で返し、AuditLog 配線は
 * Phase 2 で呼び出し側 (executeAdminMutationResult wrapper) から記録する。
 */
export async function updateInquiryCustomer(
  inquiryId: string,
  customerId: string | null,
): Promise<{ before: string | null; after: string | null }> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: { id: true, customerId: true, deletedAt: true },
  });

  if (!inquiry || inquiry.deletedAt !== null) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new DomainError("顧客が見つかりません", "NOT_FOUND");
    }
  }

  if (inquiry.customerId === customerId) {
    return { before: inquiry.customerId, after: customerId };
  }

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { customerId },
  });

  return { before: inquiry.customerId, after: customerId };
}

/**
 * 従来 hard delete していた inquiry を soft delete に変更 (Medium #23 対応)。
 * hard delete は `data-retention` cron の `inquiryMonths` 満了時のみ実行する。
 */
export async function deleteInquiry(id: string): Promise<void> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!inquiry) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  if (inquiry.deletedAt !== null) return;

  await prisma.inquiry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ============================================================================
// Create (公開フォーム経由)
// ============================================================================

type CreateInquiryInput = {
  name: string;
  companyName: string | null;
  email: string;
  phoneNumber?: string | null;
  subject: string;
  message: string;
  customerType?: CustomerType | null;
  customerId?: string | null;
};

export type InquiryPayload = {
  inquiryId: string;
  receiptNumber: string;
  name: string;
  companyName: string | null;
  email: string;
  phoneNumber: string | null;
  subject: string;
  message: string;
};

type CreateInquiryResult = {
  id: string;
  receiptNumber: string;
  payload: InquiryPayload;
};

async function resolveOrCreateGuestInquiryCustomer(
  input: CreateInquiryInput,
): Promise<string> {
  const emailCanonical = normalizeEmailForIdentity(input.email);

  const existingGuest = await prisma.customer.findFirst({
    where: { emailCanonical, userId: null },
    select: { id: true },
  });
  if (existingGuest) return existingGuest.id;

  try {
    const customer = await prisma.customer.create({
      data: {
        lastName: input.name,
        firstName: "",
        companyName: input.companyName || null,
        customerType: input.customerType ?? CustomerType.PERSONAL,
        email: input.email,
        emailCanonical,
        userId: null,
      },
      select: { id: true },
    });
    return customer.id;
  } catch (error) {
    // partial unique index (customers_emailcanonical_unlinked_key) が Phase 6 で
    // 追加されると P2002 が並列 race で確定的に発火する。Phase 1 では partial index
    // は未追加のため race で重複が作られる可能性が残るが、application 側の findFirst
    // + retry がベストエフォートで冪等性を保つ。
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const fallback = await prisma.customer.findFirst({
        where: { emailCanonical, userId: null },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }
    throw error;
  }
}

/**
 * receiptNumber を collision retry 付きで採番して Inquiry を作成する。
 * StatusHistory の初期行 (fromStatus = null) を同 transaction 内で挿入する。
 */
export async function createInquiryCommand(
  input: CreateInquiryInput,
): Promise<CreateInquiryResult> {
  // Global gate: featureModules.contact で OFF なら拒否。
  if (!(await isFeatureEnabled("contact"))) {
    throw new DomainError(
      "お問い合わせ機能は現在サイト全体で無効化されています",
      "VALIDATION",
    );
  }

  // Customer 解決: explicit authenticated owner > unlinked guest customer。
  let resolvedCustomerId = input.customerId ?? null;
  if (resolvedCustomerId === null) {
    resolvedCustomerId = await resolveOrCreateGuestInquiryCustomer(input);
  }

  // receiptNumber を UNIQUE collision で 5 回まで retry。実質衝突は起きないが安全策。
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const receiptNumber = generateReceiptNumberCandidate();
    try {
      const inquiry = await prisma.$transaction(async (tx) => {
        const created = await tx.inquiry.create({
          data: {
            receiptNumber,
            name: input.name,
            companyName: input.companyName || null,
            email: input.email,
            phoneNumber: input.phoneNumber ?? null,
            subject: input.subject,
            message: input.message,
            status: InquiryStatus.NEW,
            customerId: resolvedCustomerId,
            customerType: input.customerType ?? null,
          },
        });
        await tx.inquiryStatusHistory.create({
          data: {
            inquiryId: created.id,
            fromStatus: null,
            toStatus: InquiryStatus.NEW,
            changedById: null,
            reason: "creation",
          },
        });
        return created;
      });

      return {
        id: inquiry.id,
        receiptNumber: inquiry.receiptNumber,
        payload: {
          inquiryId: inquiry.id,
          receiptNumber: inquiry.receiptNumber,
          name: input.name,
          companyName: input.companyName,
          email: input.email,
          phoneNumber: input.phoneNumber ?? null,
          subject: input.subject,
          message: input.message,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const target = error.meta?.["target"];
        if (Array.isArray(target) && target.includes("receiptNumber")) {
          continue;
        }
      }
      throw error;
    }
  }

  throw new DomainError(
    "お問い合わせ受付番号の採番に失敗しました。しばらく経ってからもう一度お試しください",
    "UNEXPECTED",
  );
}
