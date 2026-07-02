/**
 * Instagram Feed Sync Cron API
 *
 * Cloud Scheduler から定期的に呼び出され、
 * Instagramフィードの投稿データをDBに同期します。
 *
 * ## 機能
 * - Instagram APIからフィードを取得してDBに保存
 * - 既存データを全件入れ替え（deleteMany + createMany）
 *
 * @module api/cron/instagram-sync
 */

import { revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { getDecryptedInstagramToken } from "@/shared/domain/instagram/queries";
import { syncInstagramFeed } from "@/shared/domain/instagram/commands";
import { fetchInstagramFeed } from "@/shared/lib/instagram";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";

/**
 * Instagram Feed Sync Cronエンドポイント
 * GET /api/cron/instagram-sync
 *
 * Cloud Scheduler から呼び出される
 * 毎日1〜数回実行を推奨
 *
 * セキュリティ: Cloud Scheduler OIDC token による認証
 */
export async function GET(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "instagramFeedSyncCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    // 復号済みトークンを取得
    const token = await getDecryptedInstagramToken();

    // トークンが設定されていない場合はスキップ
    if (!token) {
      return jsonSuccess({
        skipped: true,
        reason: "No Instagram token configured",
      });
    }

    // Instagram APIからフィードを取得
    const items = await fetchInstagramFeed(token, 12);

    // DBに同期（全件入れ替え）
    await syncInstagramFeed(items);

    // キャッシュを無効化
    revalidateTag(CACHE_TAGS.INSTAGRAM_FEED, CACHE_LIFE.PUBLIC_CONTENT);

    return jsonSuccess({
      synced: items.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "instagramFeedSyncCron" },
    });
    return jsonError("Instagram feed sync failed", 500);
  }
}
