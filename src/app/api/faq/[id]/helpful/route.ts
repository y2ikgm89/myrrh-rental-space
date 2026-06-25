/**
 * FAQ 項目 helpfulCount / notHelpfulCount 投票エンドポイント
 *
 * 公開エンドポイント。クライアント側で localStorage dedup、
 * サーバー側は proxy.ts の rate limit（100/min/IP）でスパム防御。
 * 個人情報は記録しない（Zendesk / HubSpot KB 方式）。
 */

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { voteFaqItemHelpful } from "@/shared/domain/faq/analytics-commands";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("FAQ");

const bodySchema = z.object({
  vote: z.enum(["helpful", "not-helpful"]),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return jsonError("Invalid FAQ ID", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const parsedBody = bodySchema.safeParse(body);
    if (!parsedBody.success) {
      return jsonError("Invalid vote", 400);
    }

    const result = await voteFaqItemHelpful(
      parsedId.data,
      parsedBody.data.vote,
    );
    return jsonSuccess({ voted: result.voted });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "faqHelpfulVote" },
    });
    return jsonError("Vote failed", 500);
  }
}
