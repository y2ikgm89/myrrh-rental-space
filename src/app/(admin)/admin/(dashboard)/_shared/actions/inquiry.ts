"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  updateInquiryStatus as updateInquiryStatusCommand,
  deleteInquiry as deleteInquiryCommand,
  replyToInquiryCommand,
  updateInquiryCustomer as updateInquiryCustomerCommand,
} from "@/shared/domain/inquiries/commands";
import {
  uploadInquiryAttachmentCommand,
  deleteInquiryAttachmentCommand,
} from "@/shared/domain/inquiries/attachment-commands";
import { anonymizeInquiryCommand } from "@/shared/domain/inquiries/anonymize-commands";
import type { AnonymizeInquiryReason } from "@/shared/domain/inquiries/anonymize-commands";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  sendInquiryReplyEmail,
  sendInquiryStatusNotificationToAll,
} from "@/shared/lib/email/inquiry-emails";
import { getInquiriesForStatusNotification } from "@/shared/domain/inquiries/email-queries";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import {
  AuditAction,
  InquiryStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("お問い合わせ");

const updateStatusSchema = z.object({
  id: idSchema,
  status: z.enum(InquiryStatus),
});

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<MutationResult> {
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.id,
    execute: async (user) => {
      // Inquiry Overhaul Phase 1: 第 3 引数 changedById が必須。実行者の
      // User.id を渡し、InquiryStatusHistory に監査ラインを残す。
      await updateInquiryStatusCommand(
        parsed.data.id,
        parsed.data.status,
        user.id,
      );
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.id));

      // Round-4 audit Finding #1 / high: 単発ステータス変更経路は 【対応完了】
      // メールを送っていなかった。bulk 側 (bulkSetStatusInquiries) は
      // RESOLVED/CLOSED 遷移時に sendInquiryStatusNotificationToAll を発火して
      // 顧客に通知するのに対し、行内 status dropdown 経由は無音だった。sender/
      // idempotency key は sendInquiryStatusNotificationToAll に集約されている
      // (Resend の idempotencyKey に inquiry.updatedAt が含まれ、reopen ↔ close
      // は都度別 nonce になる) ため、単純に [id] 配列で bulk helper に委譲する。
      if (
        parsed.data.status === InquiryStatus.RESOLVED ||
        parsed.data.status === InquiryStatus.CLOSED
      ) {
        const notifyStatus = parsed.data.status;
        fireAndForget(
          getInquiriesForStatusNotification([parsed.data.id]).then(
            (inquiries) =>
              sendInquiryStatusNotificationToAll(inquiries, notifyStatus),
          ),
          {
            operation: "updateInquiryStatus.notify",
            category: ErrorCategory.EXTERNAL_API,
          },
        );
      }
    },
  });
}

export async function deleteInquiry(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteInquiryCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
    },
  });
}

const replySchema = z.object({
  id: z.uuid({ error: "お問い合わせIDが不正です" }),
  replyMessage: z.string().min(1, { error: "回答内容を入力してください" }),
});

export async function replyToInquiry(
  inquiryId: string,
  replyMessage: string,
): Promise<MutationResult<{ id: string }>> {
  const parsed = replySchema.safeParse({ id: inquiryId, replyMessage });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.id,
    execute: async (user) => {
      const result = await replyToInquiryCommand(
        parsed.data.id,
        parsed.data.replyMessage,
        user.id,
      );

      const { emailContext } = result;
      fireAndForget(
        sendInquiryReplyEmail({
          inquiryId: parsed.data.id,
          customerName: emailContext.name,
          customerEmail: emailContext.email,
          // Inquiry Overhaul Phase 1: emailContext は
          // `{ name, email, subject, message, receiptNumber, customerUserId }` に変更。
          // 旧 originalSubject / originalMessage は subject / message に rename、
          // receiptNumber ("INQ-XXXXXXXX") が新規追加。
          subject: emailContext.subject,
          message: emailContext.message,
          receiptNumber: emailContext.receiptNumber,
          replyMessage: parsed.data.replyMessage,
          repliedByName: user.name ?? "スタッフ",
          customerUserId: emailContext.customerUserId,
        }),
        {
          operation: "sendInquiryReplyEmail",
          category: ErrorCategory.EXTERNAL_API,
        },
      );

      return { id: result.id };
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.id));
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

const updateCustomerSchema = z.object({
  inquiryId: z.uuid({ error: "お問い合わせIDが不正です" }),
  customerId: z.uuid({ error: "顧客IDが不正です" }).nullable(),
});

export async function updateInquiryCustomer(
  inquiryId: string,
  customerId: string | null,
): Promise<MutationResult> {
  const parsed = updateCustomerSchema.safeParse({ inquiryId, customerId });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async () => {
      await updateInquiryCustomerCommand(
        parsed.data.inquiryId,
        parsed.data.customerId,
      );
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.inquiryId));
      updateTag(CACHE_TAGS.CUSTOMERS);
      if (parsed.data.customerId) {
        updateTag(getCacheTag.customers.detail(parsed.data.customerId));
      }
    },
  });
}

const uploadAttachmentSchema = z.object({
  inquiryId: z.uuid({ error: "お問い合わせIDが不正です" }),
  replyId: z.uuid({ error: "返信IDが不正です" }).nullable(),
});

export async function uploadInquiryAttachment(
  formData: FormData,
): Promise<MutationResult<{ id: string }>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "ファイルを選択してください" };
  }

  const inquiryIdValue = formData.get("inquiryId");
  const replyIdValue = formData.get("replyId");
  const parsed = uploadAttachmentSchema.safeParse({
    inquiryId: typeof inquiryIdValue === "string" ? inquiryIdValue : "",
    replyId:
      typeof replyIdValue === "string" && replyIdValue.length > 0
        ? replyIdValue
        : null,
  });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async (user) =>
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: parsed.data.inquiryId,
        replyId: parsed.data.replyId,
        uploader: { type: "STAFF", userId: user.id },
      }),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.inquiryId));
    },
    resolveAuditResourceId: () => parsed.data.inquiryId,
  });
}

const deleteAttachmentSchema = z.object({
  attachmentId: z.uuid({ error: "添付ファイルIDが不正です" }),
  inquiryId: z.uuid({ error: "お問い合わせIDが不正です" }),
});

export async function deleteInquiryAttachment(
  attachmentId: string,
  inquiryId: string,
): Promise<MutationResult> {
  const parsed = deleteAttachmentSchema.safeParse({ attachmentId, inquiryId });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async () => {
      await deleteInquiryAttachmentCommand({
        attachmentId: parsed.data.attachmentId,
        actor: { type: "STAFF_ADMIN" },
      });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.inquiryId));
    },
  });
}

/**
 * Inquiry Overhaul Phase 6: お問い合わせ匿名化 Server Action。
 *
 * `anonymizeCustomer`（`@/admin/actions/customer`）と同型: `resource: "inquiry",
 * action: "delete"` の RBAC（「PII を消す」= 破壊的操作扱い、EDITOR ロール以下
 * では実行不可）+ 匿名化専用の詳細 AuditLog（`inquiry.anonymization`）。
 */
const anonymizeInquiryReasonSchema = z.enum(
  ["customer-requested", "admin-purge", "data-retention"] as const,
  { error: "匿名化理由が不正です" },
);

// 匿名化で置換される PII フィールド名（anonymizeInquiryCommand と同期）。
// customer.anonymization と同様、生 PII 値そのものは AuditLog に残さない。
// "use server" ファイルは async function 以外の export を持てないため
// (Next.js の制約)、非公開の module-local 定数として保持する。
const ANONYMIZED_INQUIRY_FIELDS = [
  "name",
  "email",
  "phoneNumber",
  "companyName",
  "message",
  "replies.body",
  "attachments",
] as const;

export async function anonymizeInquiry(
  id: string,
  reason: AnonymizeInquiryReason,
): Promise<
  MutationResult<{
    anonymized: Awaited<ReturnType<typeof anonymizeInquiryCommand>>;
    actorUserId: string;
    ip: string | null;
    userAgent: string | null;
  }>
> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }
  const validatedReason = anonymizeInquiryReasonSchema.safeParse(reason);
  if (!validatedReason.success) {
    return createValidationMutationError(validatedReason.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "delete",
    resourceId: validatedId.data,
    execute: async (user) => {
      const anonymized = await anonymizeInquiryCommand({
        inquiryId: validatedId.data,
        reason: validatedReason.data,
      });
      const { ip, userAgent } = await buildAuditRequestContext();
      return { anonymized, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(validatedId.data));

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "inquiry.anonymization",
          resourceId: validatedId.data,
          newValue: {
            reason: outcome.anonymized.reason,
            anonymizedAt: outcome.anonymized.anonymizedAt.toISOString(),
            deletedAttachmentCount: outcome.anonymized.deletedAttachmentCount,
            anonymizedFields: ANONYMIZED_INQUIRY_FIELDS,
          },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogAnonymizeInquiry",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
        },
      );
    },
  });
}
