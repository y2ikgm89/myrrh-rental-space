/**
 * ニュース予約公開キャッシュ再検証 Cron
 *
 * 管理画面の「公開日時」欄は未来日時を入力可能（上限バリデーションなし）で、
 * `isPublished:true` のまま保存できる。`getPublishedNewsList` /
 * `getPublishedNewsItem`（`src/shared/domain/news/queries.ts`）の
 * `publicNewsWhere()` gate により `publishedAt <= now` を満たさない記事は
 * 公開サイトへ露出しないが、これらの query は
 * `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`（"hours" プロファイル: revalidate
 * 1時間）でキャッシュされるため、公開日時を過ぎても次のリクエストが
 * revalidate window を跨ぐまで公開サイトには古い（＝まだ非公開扱いの）結果が
 * 返り続け得る。
 *
 * この cron は直近で `publishedAt` を迎えたニュース
 * （`findRecentlyDueScheduledNewsSlugs`）を検出し、該当があれば NEWS 系
 * キャッシュタグを明示的に revalidate することで、公開日時ちょうどでの
 * 露出精度を cron 間隔単位（`terraform/cloud_scheduler.tf` 既定 10 分）まで
 * 保証する。
 *
 * 認証: Cloud Scheduler OIDC token
 * べき等性: 対象がなければ 0 件で正常終了（revalidate 自体も no-op）
 */
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { findRecentlyDueScheduledNewsSlugs } from "@/shared/domain/news/scheduled-publish";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "newsScheduledPublishCron",
    });
    if (authResult) return authResult;

    // Feature module gate — news OFF なら早期 return（DB を一切触らない）
    if (!(await isFeatureEnabled("news"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const slugs = await findRecentlyDueScheduledNewsSlugs();

    // 変更があった場合のみキャッシュ無効化（event-import と同型の pattern）
    if (slugs.length > 0) {
      invalidateSiteWideCacheFromRouteHandler([
        CACHE_TAGS.NEWS,
        CACHE_TAGS.SIDEBAR_DATA,
        ...slugs.map((slug) => getCacheTag.news.detail(slug)),
      ]);
    }

    return jsonSuccess({ revalidated: slugs.length, slugs });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "newsScheduledPublishCron" },
    });
    return jsonError("News scheduled-publish cache revalidation failed", 500);
  }
}
