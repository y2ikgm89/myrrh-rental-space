"use server";

import { headers } from "next/headers";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { expensiveAdminRateLimiter } from "@/shared/lib/rate-limit";
import { createMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  searchByResource,
  SEARCHABLE_RESOURCES,
  type AdminSearchScope,
} from "@/shared/domain/admin-search/queries";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
import { isEditorRole } from "@/shared/lib/admin-role-guards";
import type { SearchResultGroup } from "@/shared/lib/command-palette-types";

type SearchPayload = { groups: SearchResultGroup[] };

export async function searchAdminResources(
  query: string,
): Promise<MutationResult<SearchPayload>> {
  const auth = await checkAdminAuth(await headers());
  if (!auth.success) return auth.error;

  // Round-5 audit Finding #23: formSubmitRateLimiter (5/分) は「稀に送信する
  // フォーム」向けの閾値で、200ms debounce とはいえ入力のたびに発火しうる
  // ライブ検索には厳しすぎる (公開フォームの提出ボタン連打対策と予算を共有すると
  // 数文字打っただけで枯渇する)。最大 11 リソースへの LIKE スキャンを毎回叩く
  // 重い内部検索のため、customers/search と同種の expensiveAdminRateLimiter
  // (60/分) を使う。
  const rateLimit = await checkActionRateLimit(expensiveAdminRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  const trimmed = query.trim();
  if (trimmed.length === 0) return { groups: [] };
  if (trimmed.length < 2) return { groups: [] };

  const allowed = SEARCHABLE_RESOURCES.filter((r) =>
    hasPermission(auth.user.role, r, "read"),
  );

  // EDITOR は割当ページしか読めない。`hasPermission` は resource 種別しか見ないので、
  // ここで id 集合を解決して検索側へ渡す（監査 F-92 / F-115）。渡さないと、
  // 割当外の未公開ドラフトやゴミ箱送りページのタイトルと slug が露出する。
  const scope: AdminSearchScope = isEditorRole(auth.user.role)
    ? { allowedPageIds: await getAssignedPageIdsForUser(auth.user.id) }
    : {};

  const settled = await Promise.allSettled(
    allowed.map((resource) => searchByResource(resource, trimmed, scope)),
  );

  const groups: SearchResultGroup[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.items.length > 0) {
      groups.push(result.value);
    }
  }

  return { groups };
}
