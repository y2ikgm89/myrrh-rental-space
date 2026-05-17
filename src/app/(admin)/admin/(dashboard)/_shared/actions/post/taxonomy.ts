"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  postCategorySchema,
  postTagSchema,
  type PostCategoryInput,
  type PostTagInput,
} from "@/admin/lib/validations/post";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import * as categoryCommands from "@/shared/domain/posts/category-commands";
import * as tagCommands from "@/shared/domain/posts/tag-commands";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  categoryFormSchema,
  tagFormSchema,
} from "../../../posts/taxonomy/_components/taxonomy-schema";
import {
  invalidatePostCategoryCaches,
  invalidatePostTagCaches,
  purgePostArchive,
} from "./cache-helpers";

const idSchema = z.string().uuid({ error: "カテゴリ/タグIDが不正です" });
const postCategoryOrderSchema = z
  .array(
    z.object({
      id: z.string().uuid({ error: "カテゴリIDが不正です" }),
      order: z.number().int().min(0, { error: "順序が不正です" }),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  });

export async function createPostCategory(
  input: PostCategoryInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = postCategorySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () =>
      categoryCommands.createPostCategory(omitUndefined(parsed.data)),
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePostCategory(
  id: string,
  input: PostCategoryInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = postCategorySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await categoryCommands.updatePostCategory(
        validatedId.data,
        omitUndefined(parsed.data),
      );
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
  });
}

export async function deletePostCategory(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await categoryCommands.deletePostCategory(validated.data);
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
  });
}

export async function updatePostCategoryOrder(
  items: { id: string; order: number }[],
): Promise<MutationResult> {
  const parsed = postCategoryOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    execute: async () => {
      await categoryCommands.updatePostCategoryOrder(parsed.data);
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
  });
}

export async function createPostTag(
  input: PostTagInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = postTagSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => tagCommands.createPostTag(omitUndefined(parsed.data)),
    afterSuccess: async () => {
      await invalidatePostTagCaches();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePostTag(
  id: string,
  input: PostTagInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = postTagSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await tagCommands.updatePostTag(
        validatedId.data,
        omitUndefined(parsed.data),
      );
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostTagCaches();
      await purgePostArchive();
    },
  });
}

export async function deletePostTag(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await tagCommands.deletePostTag(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POST_TAGS);
    },
  });
}

// =============================================================================
// Conform `useActionState` 用 Server Actions
//
// `(prev, formData) => SubmissionResult` signature。TaxonomyEditor (edit page)
// と CategoryManager / TagManager (dialog form) の両方で利用される。
// =============================================================================

/**
 * カテゴリ作成 — conform `useActionState` 統合経路。
 *
 * CategoryManager dialog form 用。dialog では SEO フィールド (metaTitle 等) は
 * 入力されないため optional 扱い、null 化して domain command に渡す。
 */
export async function createPostCategoryAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, categoryFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "post",
      action: "create",
      execute: async () =>
        categoryCommands.createPostCategory({
          name: data.name,
          slug: data.slug,
          description: data.description ? data.description : null,
          order: data.order,
          metaTitle: data.metaTitle ? data.metaTitle : null,
          metaDescription: data.metaDescription ? data.metaDescription : null,
          ogpImageUrl: data.ogpImageUrl ? data.ogpImageUrl : null,
        }),
      afterSuccess: async () => {
        await invalidatePostCategoryCaches();
        await purgePostArchive();
      },
      resolveAuditResourceId: (result) => result.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * タグ作成 — conform `useActionState` 統合経路。
 *
 * TagManager dialog form 用。
 */
export async function createPostTagAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, tagFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "post",
      action: "create",
      execute: async () =>
        tagCommands.createPostTag({
          name: data.name,
          slug: data.slug,
          description: data.description ? data.description : null,
          metaTitle: data.metaTitle ? data.metaTitle : null,
          metaDescription: data.metaDescription ? data.metaDescription : null,
          ogpImageUrl: data.ogpImageUrl ? data.ogpImageUrl : null,
        }),
      afterSuccess: async () => {
        await invalidatePostTagCaches();
      },
      resolveAuditResourceId: (result) => result.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updatePostCategoryAction(
  categoryId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, categoryFormSchema, async (data) => {
    const idValid = idSchema.safeParse(categoryId);
    if (!idValid.success) {
      return { ok: false, error: "カテゴリIDが不正です" };
    }

    const result = await executeAdminMutationResult({
      resource: "post",
      action: "update",
      resourceId: idValid.data,
      execute: async () => {
        await categoryCommands.updatePostCategory(idValid.data, {
          name: data.name,
          slug: data.slug,
          description: data.description ? data.description : null,
          order: data.order,
          metaTitle: data.metaTitle ? data.metaTitle : null,
          metaDescription: data.metaDescription ? data.metaDescription : null,
          ogpImageUrl: data.ogpImageUrl ? data.ogpImageUrl : null,
        });
        return null;
      },
      afterSuccess: async () => {
        await invalidatePostCategoryCaches();
        await purgePostArchive();
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updatePostTagAction(
  tagId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, tagFormSchema, async (data) => {
    const idValid = idSchema.safeParse(tagId);
    if (!idValid.success) {
      return { ok: false, error: "タグIDが不正です" };
    }

    const result = await executeAdminMutationResult({
      resource: "post",
      action: "update",
      resourceId: idValid.data,
      execute: async () => {
        await tagCommands.updatePostTag(idValid.data, {
          name: data.name,
          slug: data.slug,
          description: data.description ? data.description : null,
          metaTitle: data.metaTitle ? data.metaTitle : null,
          metaDescription: data.metaDescription ? data.metaDescription : null,
          ogpImageUrl: data.ogpImageUrl ? data.ogpImageUrl : null,
        });
        return null;
      },
      afterSuccess: async () => {
        await invalidatePostTagCaches();
        await purgePostArchive();
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
