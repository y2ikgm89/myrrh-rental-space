import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { createSuccess } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { getAdminTermsAgreements } from "@/shared/domain/terms/admin-queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

const paramsSchema = z.object({
  id: z.string().uuid({ error: "規約IDが不正です" }),
  page: z.number().int().positive({ error: "ページ番号が不正です" }),
});

function getErrorStatus(message: string): number {
  if (message.includes("ログイン") || message.includes("権限")) {
    return 403;
  }

  return 400;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await checkPermission("terms", "read", request.headers);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error.error },
        { status: getErrorStatus(auth.error.error) },
      );
    }

    const { id } = await context.params;
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    const validated = paramsSchema.safeParse({ id, page });

    if (!validated.success) {
      return NextResponse.json(createValidationError(validated.error), {
        status: 400,
      });
    }

    const data = await getAdminTermsAgreements(
      validated.data.id,
      validated.data.page,
    );

    return NextResponse.json(createSuccess("同意記録を取得しました", data));
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminTermsAgreementsGet" },
    });

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
