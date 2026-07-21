import "server-only";

import { notFound } from "next/navigation";
import { isPublicPageUnpublished } from "@/shared/domain/pages/queries";

/**
 * 固定ルート（システムページ）の冒頭で呼ぶ 1 行ガード。
 *
 * ページ行が存在し `isPublished: false`（管理画面の「非公開にする」トグル）の場合のみ
 * `notFound()` を throw する。行がまだ存在しない場合（DB 未カスタマイズの初期状態）は
 * 呼び出し元の `getPageSectionsWithFallback` による `DEFAULT_PAGE_SECTIONS` フォールバックが
 * 正当な既存仕様のため、ここでは何もしない。
 *
 * @example
 * export default async function AboutPage() {
 *   await connection();
 *   await requireSystemPagePublished("about");
 *   // ... existing code
 * }
 */
export async function requireSystemPagePublished(slug: string): Promise<void> {
  if (await isPublicPageUnpublished(slug)) {
    notFound();
  }
}
