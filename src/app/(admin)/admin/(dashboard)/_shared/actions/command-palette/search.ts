"use server";

import { headers } from "next/headers";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { createMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  searchByResource,
  SEARCHABLE_RESOURCES,
} from "@/shared/domain/admin-search/queries";
import type { SearchResultGroup } from "@/shared/lib/command-palette-types";

type SearchPayload = { groups: SearchResultGroup[] };

export async function searchAdminResources(
  query: string,
): Promise<MutationResult<SearchPayload>> {
  const auth = await checkAdminAuth(await headers());
  if (!auth.success) return auth.error;

  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  const trimmed = query.trim();
  if (trimmed.length === 0) return { groups: [] };
  if (trimmed.length < 2) return { groups: [] };

  const allowed = SEARCHABLE_RESOURCES.filter((r) =>
    hasPermission(auth.user.role, r, "read"),
  );

  const settled = await Promise.allSettled(
    allowed.map((resource) => searchByResource(resource, trimmed)),
  );

  const groups: SearchResultGroup[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.items.length > 0) {
      groups.push(result.value);
    }
  }

  return { groups };
}
