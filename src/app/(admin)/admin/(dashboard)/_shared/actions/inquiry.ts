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
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { sendInquiryReplyEmail } from "@/shared/lib/email/inquiry-emails";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";
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
    execute: async () => {
      await updateInquiryStatusCommand(parsed.data.id, parsed.data.status);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.id));
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
          originalSubject: emailContext.subject,
          originalMessage: emailContext.message,
          replyMessage: parsed.data.replyMessage,
          repliedByName: user.name ?? "スタッフ",
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
