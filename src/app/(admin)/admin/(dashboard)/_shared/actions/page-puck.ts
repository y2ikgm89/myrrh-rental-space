"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";

const savePuckDataSchema = z.object({
  slug: z.string().min(1, { error: "スラッグは必須です" }),
  puckData: z.record(z.string(), z.unknown()),
});

type SavePuckDataInput = z.infer<typeof savePuckDataSchema>;

export async function savePuckData(
  input: SavePuckDataInput,
): Promise<MutationResult> {
  const parsed = savePuckDataSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const { slug, puckData } = parsed.data;

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: slug,
    execute: async () => {
      await prisma.page.update({
        where: { slug },
        data: {
          puckData: puckData as Prisma.InputJsonValue,
        },
      });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.PAGES);
      updateTag(getCacheTag.pages.detail(slug));
    },
  });
}
