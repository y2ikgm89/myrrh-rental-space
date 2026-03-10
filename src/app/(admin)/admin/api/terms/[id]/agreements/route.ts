import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getAdminTermsAgreements } from "@/shared/domain/terms/admin-queries";
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
  id: z.string().uuid({ error: "規約IDが不正です" }),
  page: z.coerce.number().int().positive({ error: "ページ番号が不正です" }),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await checkPermission("terms", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const { id } = await context.params;
    const page = new URL(request.url).searchParams.get("page") ?? undefined;
    const validated = paramsSchema.safeParse({ id, page });

    if (!validated.success) {
      return jsonValidationError(validated.error);
    }

    const data = await getAdminTermsAgreements(
      validated.data.id,
      validated.data.page,
    );

    return jsonSuccess(data);
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminTermsAgreementsGet" },
    });

    return jsonError("Internal server error", 500);
  }
}
