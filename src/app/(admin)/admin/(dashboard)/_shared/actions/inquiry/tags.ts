"use server";

/**
 * Inquiry Overhaul PR4 (ops surfaces): タグマスタ CRUD。
 *
 * Inquiry 単体に紐づかない master data のため `./ops.ts` から分離。
 * `inquiry:manage` 権限 (ADMIN / SUPER_ADMIN のみ) で保護する。
 */

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createInquiryTagCommand,
  deleteInquiryTagCommand,
  updateInquiryTagCommand,
} from "@/shared/domain/inquiries/ops-commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { inquiryTagFormSchema } from "@/shared/lib/validations/inquiry-tag";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("タグ");

export async function createInquiryTag(
  name: string,
  color: string | null,
): Promise<MutationResult<{ id: string }>> {
  const parsed = inquiryTagFormSchema.safeParse({ name, color: color ?? "" });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "manage",
    execute: async () =>
      createInquiryTagCommand({
        name: parsed.data.name,
        color: parsed.data.color || null,
      }),
    afterSuccess: () => updateTag(CACHE_TAGS.INQUIRIES),
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function updateInquiryTag(
  id: string,
  name: string,
  color: string | null,
): Promise<MutationResult> {
  const parsedId = idSchema.safeParse(id);
  const parsed = inquiryTagFormSchema.safeParse({ name, color: color ?? "" });
  if (!parsedId.success) {
    return createValidationMutationError(parsedId.error);
  }
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "manage",
    resourceId: parsedId.data,
    execute: async () => {
      await updateInquiryTagCommand(parsedId.data, {
        name: parsed.data.name,
        color: parsed.data.color || null,
      });
      return null;
    },
    afterSuccess: () => updateTag(CACHE_TAGS.INQUIRIES),
  });
}

export async function deleteInquiryTag(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "manage",
    resourceId: validated.data,
    execute: async () => {
      await deleteInquiryTagCommand(validated.data);
      return null;
    },
    afterSuccess: () => updateTag(CACHE_TAGS.INQUIRIES),
  });
}
