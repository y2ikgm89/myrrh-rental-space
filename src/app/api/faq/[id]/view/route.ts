/**
 * FAQ 項目 viewCount increment エンドポイント
 *
 * 公開エンドポイント。クライアント側で localStorage dedup、
 * サーバー側は proxy.ts の rate limit（100/min/IP）でスパム防御。
 * 個人情報は記録しない（Zendesk / HubSpot KB 方式）。
 */

import { unstable_rethrow } from "next/navigation";
import { incrementFaqItemViewCount } from "@/shared/domain/faq/analytics-commands";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("FAQ");

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return jsonError("Invalid FAQ ID", 400);
    }

    const result = await incrementFaqItemViewCount(parsed.data);
    return jsonSuccess({ incremented: result.incremented });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "faqViewIncrement" },
    });
    return jsonError("Increment failed", 500);
  }
}
