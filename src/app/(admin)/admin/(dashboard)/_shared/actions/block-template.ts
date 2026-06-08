"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  createBlockTemplate as createBlockTemplateCommand,
  deleteBlockTemplate as deleteBlockTemplateCommand,
} from "@/shared/domain/block-template/commands";
import { CACHE_TAGS } from "@/shared/lib/constants";

const createBlockTemplateSchema = z.object({
  name: z
    .string()
    .min(1, { error: "テンプレート名は必須です" })
    .max(100, { error: "100文字以内で入力してください" }),
  description: z
    .string()
    .max(500, { error: "500文字以内で入力してください" })
    .optional(),
  nodeJson: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
});

const idSchema = z.uuid({ error: "テンプレートIDが不正です" });
type CreateBlockTemplateInput = z.infer<typeof createBlockTemplateSchema>;

export async function createBlockTemplate(
  input: CreateBlockTemplateInput,
): Promise<MutationResult<{ id: string }>> {
  const validated = createBlockTemplateSchema.safeParse(input);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "blockTemplate",
    action: "create",
    execute: async (user) =>
      createBlockTemplateCommand(omitUndefined(validated.data), user.id),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.BLOCK_TEMPLATES);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function deleteBlockTemplate(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "blockTemplate",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteBlockTemplateCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.BLOCK_TEMPLATES);
    },
  });
}
