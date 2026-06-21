"use server";

import type { SubmissionResult } from "@conform-to/react";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import {
  invalidateSiteWideCache,
  purgeMarketingHomeTag,
  firePurgeAsync,
} from "@/shared/lib/cache";
import { z } from "zod";
import { parsePrismaInputJson } from "@/shared/db/json";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { isMutationError } from "@/shared/lib/mutation-result";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { omitUndefined } from "@/shared/lib/serialize";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import {
  createSpaceCommand,
  deleteSpaceCommand,
  duplicateSpaceCommand,
  updateSpaceCommand,
  updateSpacePublishedCommand,
} from "@/shared/domain/spaces/commands";
import {
  spaceFormSchema,
  type SpaceFormData,
} from "@/admin/lib/validations/space";

const idSchema = z.uuid({ error: "IDが不正です" });

interface SpaceTarget {
  id: string;
  slug: string;
  /** Previous slug when a rename happened; purged alongside the new slug. */
  oldSlug?: string;
}

function revalidateSpaces(targets: ReadonlyArray<SpaceTarget>): void {
  // Site-wide tag invalidation (Next data cache + CDN via batcher).
  invalidateSiteWideCache([
    CACHE_TAGS.SPACES,
    CACHE_TAGS.SPACE_CATEGORIES,
    CACHE_TAGS.LOCATIONS,
    CACHE_TAGS.REVIEWS,
  ]);

  // Per-id REVIEWS sub-tags. Review.spaceId is a FK — MUST stay id-keyed.
  const seenIds = new Set<string>();
  for (const t of targets) {
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);
    updateTag(getCacheTag.reviews.space(t.id));
    updateTag(getCacheTag.reviews.stats(t.id));
  }

  // CDN URL purge — slug-keyed (matches the actual public route /spaces/[slug]).
  const seenSlugs = new Set<string>();
  const detailPaths: string[] = [];
  for (const t of targets) {
    if (!seenSlugs.has(t.slug)) {
      seenSlugs.add(t.slug);
      detailPaths.push(`/spaces/${t.slug}`);
    }
    if (t.oldSlug && t.oldSlug !== t.slug && !seenSlugs.has(t.oldSlug)) {
      seenSlugs.add(t.oldSlug);
      detailPaths.push(`/spaces/${t.oldSlug}`);
    }
  }
  if (detailPaths.length > 0) {
    void firePurgeAsync(() => purgeCloudflareDetailUrls(detailPaths), {
      operation: "revalidateSpaces.detailUrlPurge",
      urls: detailPaths,
    });
  }

  // Marketing aggregation: / and /about with space-showcase section.
  purgeMarketingHomeTag();
}

function buildSpaceCommandInput(data: SpaceFormData) {
  const descriptionHtml = data.descriptionHtml;
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);
  const descriptionJson = parsePrismaInputJson(
    data.descriptionJson,
    "descriptionJson が不正です",
  );

  const {
    descriptionJson: _dropJson,
    descriptionHtml: _dropHtml,
    ...rest
  } = data;
  void _dropJson;
  void _dropHtml;
  return omitUndefined({
    ...rest,
    descriptionJson,
    descriptionHtml,
    descriptionPlainText,
  });
}

export async function createSpace(
  input: SpaceFormData,
): Promise<MutationResult<Awaited<ReturnType<typeof createSpaceCommand>>>> {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => {
      const commandInput = buildSpaceCommandInput(parsed.data);
      return createSpaceCommand(commandInput);
    },
    afterSuccess: (result) => {
      revalidateSpaces([{ id: result.id, slug: result.slug }]);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

/**
 * 管理画面 新規 Space 作成 — conform `useActionState` canonical
 *
 * `(prev, formData) => SubmissionResult` signature。
 * 成功時は server-side `redirect(/admin/spaces/<id>)` で詳細ページに遷移、失敗時は `submission.reply()`。
 */
export async function createSpaceAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let createdId: string | null = null;

  const submissionResult = await executeConformMutation(
    formData,
    spaceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "space",
        action: "create",
        execute: async () => {
          const commandInput = buildSpaceCommandInput(data);
          return createSpaceCommand(commandInput);
        },
        afterSuccess: (payload) => {
          revalidateSpaces([{ id: payload.id, slug: payload.slug }]);
        },
        resolveAuditResourceId: (payload) => payload.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      createdId = result.id;
      return { ok: true };
    },
  );

  if (createdId !== null) {
    redirect(toAppRoute(`/admin/spaces/${createdId}`));
  }

  return submissionResult;
}

/**
 * 管理画面 Space 更新 — conform `useActionState` canonical
 *
 * id は `bind(null, space.id)` で部分適用。
 * 成功時は server-side `redirect(/admin/spaces/<id>)` で詳細ページに遷移。
 */
export async function updateSpaceAction(
  spaceId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  const validatedId = idSchema.safeParse(spaceId);
  if (!validatedId.success) {
    return {
      status: "error",
      error: { "": ["スペースIDが不正です"] },
    } satisfies SubmissionResult;
  }
  const id = validatedId.data;

  let success = false;

  const submissionResult = await executeConformMutation(
    formData,
    spaceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "space",
        action: "update",
        resourceId: id,
        execute: async () => {
          const commandInput = buildSpaceCommandInput(data);
          return updateSpaceCommand(id, commandInput);
        },
        afterSuccess: (r) => {
          revalidateSpaces([{ id: r.id, slug: r.slug, oldSlug: r.oldSlug }]);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      success = true;
      return { ok: true };
    },
  );

  if (success) {
    redirect(toAppRoute(`/admin/spaces/${id}`));
  }

  return submissionResult;
}

export async function updateSpacePublished(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<{ id: string; slug: string; isPublished: boolean }>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    resourceId: parsed.data,
    execute: async () => updateSpacePublishedCommand(parsed.data, isPublished),
    afterSuccess: (r) => {
      revalidateSpaces([{ id: r.id, slug: r.slug }]);
    },
  });
}

export async function deleteSpace(
  id: string,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => deleteSpaceCommand(parsed.data),
    afterSuccess: (r) => {
      revalidateSpaces([{ id: r.id, slug: r.slug }]);
    },
  });
}

export async function duplicateSpace(
  id: string,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => duplicateSpaceCommand(validated.data),
    afterSuccess: (data) => {
      revalidateSpaces([{ id: data.id, slug: data.slug }]);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}
