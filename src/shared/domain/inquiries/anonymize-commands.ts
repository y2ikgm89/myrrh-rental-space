import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getR2InquiriesBucketName } from "@/shared/lib/r2/client";
import { deleteObjectsFromBucket } from "@/shared/lib/r2/delete";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * Inquiry Overhaul Phase 6: お問い合わせ PII 匿名化 (anonymize) command。
 *
 * `anonymizeCustomerCommand`（`@/shared/domain/customers/customer-lifecycle-commands`）と同型の
 * 契約: 物理削除ではなく PII を placeholder に置換し `anonymizedAt` /
 * `anonymizedReason` を刻印する append-only 証跡アプローチ。
 *
 * Customer 匿名化時は `anonymizeCustomerCommand` 内で未匿名化 Inquiry へ
 * `reason: "customer-cascade"` を連鎖適用する（SSoT）。個別の admin 匿名化は
 * 本 command を直接呼ぶ。
 *
 * 匿名化される列 / データ:
 * - name          → "削除済み"
 * - email         → `deleted+<inquiry.id>@anonymized.local`（unique 制約なしだが
 *   customer と同じ形式で統一）
 * - phoneNumber / companyName → null
 * - message       → placeholder 文言
 * - InquiryReply.body（全件） → placeholder 文言
 * - InquiryAttachment → private R2 object 削除 + DB 行削除
 *   （`getInquiryAttachmentForDownload` は anonymizedAt 非 null を 404 相当に
 *   する設計だが、万一 DB 行が残る事故を避けるため実体も削除する）
 *
 * 冪等: 既に `anonymizedAt` が非 null なら `DomainError`（CONFLICT）を throw。
 * soft-deleted（`deletedAt` 非 null）でも匿名化を許可する — 保持期間中の
 * 権利者請求（GDPR 相当）に応じるため、削除だけでは PII が残ってしまう。
 *
 * R2 の実削除は DB トランザクション確定後に行う（`purgeExpiredInquiries` と
 * 同型）。DB トランザクション内で外部 I/O を待たないためと、R2 削除が
 * 一時的に失敗しても PII の DB 上の匿名化自体は確定させるため。R2 削除の
 * 失敗は log のみで例外を re-throw しない（orphan object は許容し、
 * 匿名化そのものの成功を優先する）。
 */
export type AnonymizeInquiryReason =
  "customer-requested" | "admin-purge" | "data-retention" | "customer-cascade";

const INQUIRY_ANONYMIZE_PLACEHOLDER_NAME = "削除済み";
/**
 * 件名も自由記入（最大 200 文字）で、実際に氏名や電話番号が書かれる。
 * 匿名化後も管理画面の詳細・一覧に出るうえ、検索が subject を contains で引くため
 * **氏名で検索してヒットしてしまう**（監査 F-52）。
 */
const INQUIRY_ANONYMIZE_PLACEHOLDER_SUBJECT = "この内容は匿名化されました";
const INQUIRY_ANONYMIZE_PLACEHOLDER_MESSAGE = "この内容は匿名化されました";
const INQUIRY_ANONYMIZE_PLACEHOLDER_REPLY_BODY = "この内容は匿名化されました";

function buildAnonymizedInquiryEmail(inquiryId: string): string {
  return `deleted+${inquiryId}@anonymized.local`;
}

export type AnonymizeInquiryTx = {
  inquiry: Pick<typeof prisma.inquiry, "findUnique" | "update">;
  inquiryReply: Pick<typeof prisma.inquiryReply, "updateMany">;
  inquiryAttachment: Pick<
    typeof prisma.inquiryAttachment,
    "findMany" | "deleteMany"
  >;
};

/**
 * Inquiry PII 匿名化の DB 更新本体。呼び出し側は tx 内で対象が未匿名化であること
 * を保証する（standalone command は事前に NOT_FOUND / CONFLICT を検査）。
 */
export async function anonymizeInquiryInTx(
  tx: AnonymizeInquiryTx,
  input: { inquiryId: string; reason: AnonymizeInquiryReason },
): Promise<{ anonymizedAt: Date; deletedR2Keys: string[] }> {
  const anonymizedAt = new Date();

  await tx.inquiry.update({
    where: { id: input.inquiryId },
    data: {
      name: INQUIRY_ANONYMIZE_PLACEHOLDER_NAME,
      subject: INQUIRY_ANONYMIZE_PLACEHOLDER_SUBJECT,
      email: buildAnonymizedInquiryEmail(input.inquiryId),
      phoneNumber: null,
      companyName: null,
      message: INQUIRY_ANONYMIZE_PLACEHOLDER_MESSAGE,
      anonymizedAt,
      anonymizedReason: input.reason,
    },
  });

  await tx.inquiryReply.updateMany({
    where: { inquiryId: input.inquiryId },
    data: { body: INQUIRY_ANONYMIZE_PLACEHOLDER_REPLY_BODY },
  });

  const attachments = await tx.inquiryAttachment.findMany({
    where: { inquiryId: input.inquiryId },
    select: { r2Key: true },
  });

  if (attachments.length > 0) {
    await tx.inquiryAttachment.deleteMany({
      where: { inquiryId: input.inquiryId },
    });
  }

  return {
    anonymizedAt,
    deletedR2Keys: attachments.map((a) => a.r2Key),
  };
}

export async function deleteInquiryAttachmentR2Keys(input: {
  r2Keys: string[];
  operation: string;
  inquiryId?: string;
}): Promise<void> {
  if (input.r2Keys.length === 0) {
    return;
  }

  try {
    const bucket = getR2InquiriesBucketName();
    const result = await deleteObjectsFromBucket(bucket, input.r2Keys);
    if (!result.success) {
      logError(new Error(result.error ?? "R2 delete failed"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: input.operation,
          ...(input.inquiryId !== undefined && { inquiryId: input.inquiryId }),
          count: input.r2Keys.length,
        },
      });
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: input.operation,
        ...(input.inquiryId !== undefined && { inquiryId: input.inquiryId }),
        count: input.r2Keys.length,
      },
    });
  }
}

export async function anonymizeInquiryCommand(input: {
  inquiryId: string;
  reason: AnonymizeInquiryReason;
}): Promise<{
  inquiryId: string;
  anonymizedAt: Date;
  reason: AnonymizeInquiryReason;
  deletedAttachmentCount: number;
}> {
  const { anonymizedAt, deletedR2Keys } = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.inquiry.findUnique({
        where: { id: input.inquiryId },
        select: { id: true, anonymizedAt: true },
      });

      if (!existing) {
        throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
      }

      if (existing.anonymizedAt !== null) {
        throw new DomainError(
          "このお問い合わせは既に匿名化済みです",
          "CONFLICT",
        );
      }

      return anonymizeInquiryInTx(tx, {
        inquiryId: existing.id,
        reason: input.reason,
      });
    },
  );

  await deleteInquiryAttachmentR2Keys({
    r2Keys: deletedR2Keys,
    operation: "anonymizeInquiryCommand.r2Cleanup",
    inquiryId: input.inquiryId,
  });

  return {
    inquiryId: input.inquiryId,
    anonymizedAt,
    reason: input.reason,
    deletedAttachmentCount: deletedR2Keys.length,
  };
}
