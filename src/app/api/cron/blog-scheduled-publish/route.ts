/**
 * ブログ予約公開キャッシュ再検証 Cron
 *
 * 管理画面の「公開日時」欄は未来日時を入力可能（上限バリデーションなし）で、
 * `status: PUBLISHED` のまま保存できる。`getPublishedPostsList` /
 * `getPublishedPost`（`src/shared/domain/posts/queries.ts`）の
 * `publicPostsWhere()` gate により `publishedAt <= now` を満たさない記事は
 * 公開サイトへ露出しないが、これらの query は
 * `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`（"hours" プロファイル: revalidate
 * 1時間）でキャッシュされるため、公開日時を過ぎても次のリクエストが
 * revalidate window を跨ぐまで公開サイトには古い（＝まだ非公開扱いの）結果が
 * 返り続け得る。
 *
 * この cron は直近で `publishedAt` を迎えたポスト
 * （`findRecentlyDueScheduledPostSlugs`）を検出し、該当があれば POSTS 系
 * キャッシュタグを明示的に revalidate することで、公開日時ちょうどでの
 * 露出精度を cron 間隔単位（`terraform/cloud_scheduler.tf` 既定 10 分）まで
 * 保証する。
 *
 * 認証: Cloud Scheduler OIDC token
 * べき等性: 対象がなければ 0 件で正常終了（revalidate 自体も no-op）
 */
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { findRecentlyDueScheduledPostSlugs } from "@/shared/domain/posts/scheduled-publish";
import { firePurgeAsync } from "@/shared/lib/cache";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
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
      operation: "blogScheduledPublishCron",
    });
    if (authResult) return authResult;

    // Feature module gate — posts (blog) OFF なら早期 return（DB を一切触らない）
    if (!(await isFeatureEnabled("posts"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const slugs = await findRecentlyDueScheduledPostSlugs();

    // 変更があった場合のみキャッシュ無効化（news-scheduled-publish と同型の pattern）
    if (slugs.length > 0) {
      invalidateSiteWideCacheFromRouteHandler([
        CACHE_TAGS.POSTS,
        CACHE_TAGS.SIDEBAR_DATA,
        ...slugs.map((slug) => getCacheTag.posts.detail(slug)),
      ]);
      // /feed.xml は Cache-Tag を emit しない。CRUD は invalidatePostCollectionCaches
      // で URL purge しているが、予約公開 cron は tag revalidate のみだった。
      void firePurgeAsync(() => purgeCloudflareDetailUrls(["/feed.xml"]), {
        operation: "purgePostFeed",
        urls: ["/feed.xml"],
      });
    }

    return jsonSuccess({ revalidated: slugs.length, slugs });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "blogScheduledPublishCron" },
    });
    return jsonError("Blog scheduled-publish cache revalidation failed", 500);
  }
}
