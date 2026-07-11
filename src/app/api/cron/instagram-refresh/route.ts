/**
 * Instagram Token Refresh Cron API
 *
 * Cloud Scheduler から定期的に呼び出され、
 * Instagramアクセストークンの自動更新を実行します。
 *
 * ## 機能
 * - 有効期限10日以内のトークンを自動更新
 * - 更新失敗時のエラーログ記録
 *
 * @module api/cron/instagram-refresh
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { getInstagramRefreshState } from "@/shared/domain/instagram/queries";
import { refreshInstagramAccessToken } from "@/shared/domain/instagram/commands";
import {
  refreshLongLivedToken,
  getTokenExpiryDays,
} from "@/shared/lib/instagram";
import { safeDecryptToString } from "@/shared/lib/crypto";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";

/** トークン更新を開始する残り日数（10日） */
const REFRESH_THRESHOLD_DAYS = 10;

/**
 * Instagram Token Refresh Cronエンドポイント
 * GET /api/cron/instagram-refresh
 *
 * Cloud Scheduler から呼び出される
 * 毎日1回実行を推奨
 *
 * セキュリティ: Cloud Scheduler OIDC token による認証
 */
export async function GET(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "instagramTokenRefreshCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    // Instagram設定を取得
    const settings = await getInstagramRefreshState();

    // トークンが設定されていない場合はスキップ
    if (!settings.encryptedAccessToken || !settings.tokenExpiresAt) {
      return jsonSuccess({
        skipped: true,
        reason: "No Instagram token configured",
      });
    }

    // 有効期限までの残り日数を計算
    const daysRemaining = getTokenExpiryDays(settings.tokenExpiresAt);

    // 残り日数が閾値以上ならスキップ
    if (daysRemaining > REFRESH_THRESHOLD_DAYS) {
      return jsonSuccess({
        skipped: true,
        reason: `Token is still valid (${daysRemaining} days remaining)`,
        daysRemaining,
      });
    }

    // トークンを復号
    const decryptedToken = safeDecryptToString(settings.encryptedAccessToken, {
      expectedPurpose: "instagram",
    });
    if (!decryptedToken) {
      logError(new Error("Failed to decrypt Instagram access token"), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
        context: { operation: "instagramTokenRefreshCron" },
      });
      return jsonError("Failed to decrypt access token", 503);
    }

    // トークンをリフレッシュ
    const refreshResult = await refreshLongLivedToken(decryptedToken);

    // 新しい有効期限を計算（現在時刻 + expires_in秒）
    const newExpiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000);

    // 新しいトークンを暗号化して保存
    await refreshInstagramAccessToken({
      accessToken: refreshResult.accessToken,
      expiresAt: newExpiresAt,
    });

    invalidateSiteWideCacheFromRouteHandler(CACHE_TAGS.INTEGRATION_SETTINGS, {
      skipCdnPurge: true,
    });

    const newDaysRemaining = getTokenExpiryDays(newExpiresAt);

    return jsonSuccess({
      previousDaysRemaining: daysRemaining,
      newDaysRemaining,
      newExpiresAt: newExpiresAt.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "instagramTokenRefreshCron" },
    });
    return jsonError("Instagram token refresh failed", 500);
  }
}
