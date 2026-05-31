import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { LINK_CARD_CONTENT_TYPES } from "@/shared/domain/link-cards/content-types";
import { searchLinkCardCandidates } from "@/shared/domain/link-cards/search-queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  jsonError,
  jsonSuccess,
  jsonValidationError,
} from "@/shared/lib/route-responses";

const querySchema = z.object({
  contentType: z.enum(LINK_CARD_CONTENT_TYPES),
  query: z.string().max(100).default(""),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkAdminAuth(request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, 401);
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      contentType: url.searchParams.get("contentType"),
      query: url.searchParams.get("query") ?? "",
    });
    if (!parsed.success) {
      return jsonValidationError(parsed.error, "リクエストが不正です");
    }

    const items = await searchLinkCardCandidates(parsed.data);
    return jsonSuccess({ items });
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminLinkCardsSearchGet" },
    });
    return jsonError("Internal server error", 500);
  }
}
