"use server";

/**
 * Inquiry Overhaul PR4 (ops surfaces): 担当者 / SLA / internal メモ / タグ付与。
 *
 * タグマスタ CRUD は `./tags.ts` に分離 (Inquiry 単体に紐づかない master data)。
 */

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  assignInquiryCommand,
  createInquiryInternalNoteCommand,
  deleteInquiryInternalNoteCommand,
  setInquiryTagsCommand,
  updateInquirySlaCommand,
} from "@/shared/domain/inquiries/ops-commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("お問い合わせ");

function invalidateInquiryDetailCaches(inquiryId: string): void {
  updateTag(CACHE_TAGS.INQUIRIES);
  updateTag(getCacheTag.inquiries.detail(inquiryId));
}

// ============================================================================
// 担当者アサイン
// ============================================================================

const assignSchema = z.object({
  inquiryId: idSchema,
  assigneeId: z.uuid({ error: "担当者IDが不正です" }).nullable(),
});

export async function assignInquiry(
  inquiryId: string,
  assigneeId: string | null,
): Promise<MutationResult> {
  const parsed = assignSchema.safeParse({ inquiryId, assigneeId });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async (user) => {
      await assignInquiryCommand(
        parsed.data.inquiryId,
        parsed.data.assigneeId,
        user.id,
      );
      return null;
    },
    afterSuccess: () => invalidateInquiryDetailCaches(parsed.data.inquiryId),
  });
}

// ============================================================================
// SLA 対応期限
// ============================================================================

/** `<input type="datetime-local">` の文字列 (空文字/null = クリア) を Date に変換する。 */
function parseSlaExpiresAtInput(value: string | null): Date | null {
  if (!value) return null;
  const parsed = parseDateTimeLocalAsJst(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const updateSlaSchema = z.object({
  inquiryId: idSchema,
  slaExpiresAtInput: z.string().nullable(),
});

export async function updateInquirySla(
  inquiryId: string,
  slaExpiresAtInput: string | null,
): Promise<MutationResult> {
  const parsed = updateSlaSchema.safeParse({ inquiryId, slaExpiresAtInput });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async () => {
      await updateInquirySlaCommand(
        parsed.data.inquiryId,
        parseSlaExpiresAtInput(parsed.data.slaExpiresAtInput),
      );
      return null;
    },
    afterSuccess: () => invalidateInquiryDetailCaches(parsed.data.inquiryId),
  });
}

// ============================================================================
// internal メモ (スタッフ専用)
// ============================================================================

const createNoteSchema = z.object({
  inquiryId: idSchema,
  body: z
    .string()
    .trim()
    .min(1, { error: "メモを入力してください" })
    .max(2000, { error: "メモは2000文字以内で入力してください" }),
});

export async function createInquiryInternalNote(
  inquiryId: string,
  body: string,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createNoteSchema.safeParse({ inquiryId, body });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async (user) => {
      const note = await createInquiryInternalNoteCommand(
        parsed.data.inquiryId,
        user.id,
        parsed.data.body,
      );
      return { id: note.id };
    },
    afterSuccess: () => invalidateInquiryDetailCaches(parsed.data.inquiryId),
  });
}

const deleteNoteSchema = z.object({
  inquiryId: idSchema,
  noteId: z.uuid({ error: "メモIDが不正です" }),
});

export async function deleteInquiryInternalNote(
  inquiryId: string,
  noteId: string,
): Promise<MutationResult> {
  const parsed = deleteNoteSchema.safeParse({ inquiryId, noteId });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async (user) => {
      await deleteInquiryInternalNoteCommand(
        parsed.data.noteId,
        user.id,
        user.role,
      );
      return null;
    },
    afterSuccess: () => invalidateInquiryDetailCaches(parsed.data.inquiryId),
  });
}

// ============================================================================
// タグ付与 (全置換)
// ============================================================================

const setTagsSchema = z.object({
  inquiryId: idSchema,
  tagIds: z
    .array(z.uuid({ error: "タグIDが不正です" }))
    .max(20, { error: "タグは20件まで設定できます" }),
});

export async function setInquiryTags(
  inquiryId: string,
  tagIds: string[],
): Promise<MutationResult> {
  const parsed = setTagsSchema.safeParse({ inquiryId, tagIds });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.inquiryId,
    execute: async () => {
      await setInquiryTagsCommand(parsed.data.inquiryId, parsed.data.tagIds);
      return null;
    },
    afterSuccess: () => invalidateInquiryDetailCaches(parsed.data.inquiryId),
  });
}
