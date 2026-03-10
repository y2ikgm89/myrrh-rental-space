import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getBlockTemplateNodeJsonById } from "@/shared/domain/block-template/queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
  jsonValidationError,
} from "@/shared/lib/route-responses";

const paramsSchema = z.object({
  id: z.string().uuid({ error: "テンプレートIDが不正です" }),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await checkPermission(
      "blockTemplate",
      "read",
      request.headers,
    );
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const validated = paramsSchema.safeParse(await context.params);
    if (!validated.success) {
      return jsonValidationError(validated.error);
    }

    const template = await getBlockTemplateNodeJsonById(validated.data.id);
    if (!template) {
      return jsonError("テンプレートが見つかりません", 404);
    }

    return jsonSuccess(template);
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminBlockTemplateGet" },
    });

    return jsonError("Internal server error", 500);
  }
}
