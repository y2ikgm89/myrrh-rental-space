import "server-only";

import { connection } from "next/server";
import { requireFeatureEnabled } from "@/shared/domain/features/check";

/**
 * events Feature Module の 404 ガード（動的スコープ専用）。
 *
 * 公開詳細 page の static shell は CDN/PPR 用に prerender されるため、
 * `requireFeatureEnabled` を page 本体から呼べない（`getFeatureModulesSettings`
 * は criticalFetch で DB 必須）。metadata の `withFeatureGate` と対称に、
 * body 側は Suspense 内 async SC + `connection()` で request-time に gate する。
 */
export async function EventDetailFeatureGate(): Promise<null> {
  await connection();
  await requireFeatureEnabled("events");
  return null;
}
