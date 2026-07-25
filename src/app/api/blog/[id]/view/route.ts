/**
 * ブログ記事 viewCount increment エンドポイント
 *
 * 公開エンドポイント。クライアント側で localStorage dedup、
 * サーバー側は proxy.ts の rate limit（100/min/IP）でスパム防御。
 * 個人情報は記録しない（Zendesk / HubSpot KB 方式）。
 */

import { unstable_rethrow } from "next/navigation";
import { incrementPostViewCount } from "@/shared/domain/posts/analytics-commands";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("Post");

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    // FEAT-3PLANE-01: posts module OFF 時に 404 で塞ぐ (公開 /blog page が
    // requireFeatureEnabled で 404 になっているのと対称)。gate 無しだと
    // viewCount が「表示されない記事」に対して増え続ける silent bug。
    if (!(await isFeatureEnabled("posts"))) {
      return jsonError("Not found", 404);
    }
    const { id } = await context.params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return jsonError("Invalid Post ID", 400);
    }

    const result = await incrementPostViewCount(parsed.data);
    return jsonSuccess({ incremented: result.incremented });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "postViewIncrement" },
    });
    return jsonError("Increment failed", 500);
  }
}
