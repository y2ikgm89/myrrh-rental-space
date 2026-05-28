import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { searchPostsForEventRelation } from "@/shared/domain/events/admin-queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

/**
 * Event 関連記事 selector 向けの Post 検索 endpoint。
 *
 * server-actions/export-contract.md "Reader 関数を `"use server"` で export しない —
 * Route Handler `route.ts` が公式推奨" に準拠した実装。
 *
 * - GET `/admin/api/events/related-posts?q=<query>&includeIds=<comma-separated>`
 * - 認証: `checkPermission("event", "read", request.headers)` (403 で reject)
 * - 戻り値: `EventRelatedPostOption[]` JSON 配列 (最大 20 件 + 既選択 ID merge)
 */
const searchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  includeIds: z
    .string()
    .max(1000)
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return undefined;
      const ids = value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      return ids.length > 0 ? ids : undefined;
    })
    .pipe(z.array(z.string().uuid()).max(12).optional()),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await checkPermission("event", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    includeIds: url.searchParams.get("includeIds") ?? undefined,
  });
  if (!parsed.success) {
    return jsonValidationError(parsed.error, "検索条件が不正です");
  }

  const data = await searchPostsForEventRelation({
    ...(parsed.data.q !== undefined && { query: parsed.data.q }),
    ...(parsed.data.includeIds !== undefined && {
      includeIds: parsed.data.includeIds,
    }),
  });
  return NextResponse.json(data);
}
