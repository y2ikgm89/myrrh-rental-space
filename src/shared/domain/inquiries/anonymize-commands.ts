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
 * `anonymizeCustomerCommand`（`@/shared/domain/customers/commands`）と同型の
 * 契約: 物理削除ではなく PII を placeholder に置換し `anonymizedAt` /
 * `anonymizedReason` を刻印する append-only 証跡アプローチ。Inquiry は
 * Customer と独立した匿名化対象 — Customer.anonymize 時に inquiry を自動で
 * 追随させることは非ゴール（design §6.5「Inquiry は独立」）。
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
  "customer-requested" | "admin-purge" | "data-retention";

const INQUIRY_ANONYMIZE_PLACEHOLDER_NAME = "削除済み";
const INQUIRY_ANONYMIZE_PLACEHOLDER_MESSAGE = "この内容は匿名化されました";
const INQUIRY_ANONYMIZE_PLACEHOLDER_REPLY_BODY = "この内容は匿名化されました";

function buildAnonymizedInquiryEmail(inquiryId: string): string {
  return `deleted+${inquiryId}@anonymized.local`;
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

      const anonymizedAt = new Date();

      await tx.inquiry.update({
        where: { id: existing.id },
        data: {
          name: INQUIRY_ANONYMIZE_PLACEHOLDER_NAME,
          email: buildAnonymizedInquiryEmail(existing.id),
          phoneNumber: null,
          companyName: null,
          message: INQUIRY_ANONYMIZE_PLACEHOLDER_MESSAGE,
          anonymizedAt,
          anonymizedReason: input.reason,
        },
      });

      await tx.inquiryReply.updateMany({
        where: { inquiryId: existing.id },
        data: { body: INQUIRY_ANONYMIZE_PLACEHOLDER_REPLY_BODY },
      });

      const attachments = await tx.inquiryAttachment.findMany({
        where: { inquiryId: existing.id },
        select: { r2Key: true },
      });

      if (attachments.length > 0) {
        await tx.inquiryAttachment.deleteMany({
          where: { inquiryId: existing.id },
        });
      }

      return {
        anonymizedAt,
        deletedR2Keys: attachments.map((a) => a.r2Key),
      };
    },
  );

  if (deletedR2Keys.length > 0) {
    try {
      const bucket = getR2InquiriesBucketName();
      const result = await deleteObjectsFromBucket(bucket, deletedR2Keys);
      if (!result.success) {
        logError(new Error(result.error ?? "R2 delete failed"), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: "anonymizeInquiryCommand.r2Cleanup",
            inquiryId: input.inquiryId,
            count: deletedR2Keys.length,
          },
        });
      }
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "anonymizeInquiryCommand.r2Cleanup",
          inquiryId: input.inquiryId,
          count: deletedR2Keys.length,
        },
      });
    }
  }

  return {
    inquiryId: input.inquiryId,
    anonymizedAt,
    reason: input.reason,
    deletedAttachmentCount: deletedR2Keys.length,
  };
}
