import { NextResponse } from "next/server";
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

const paramsSchema = z.object({
  id: z.string().uuid({ error: "テンプレートIDが不正です" }),
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
    const auth = await checkPermission(
      "blockTemplate",
      "read",
      request.headers,
    );
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error.error },
        { status: getErrorStatus(auth.error.error) },
      );
    }

    const validated = paramsSchema.safeParse(await context.params);
    if (!validated.success) {
      return NextResponse.json(
        { error: "テンプレートIDが不正です" },
        { status: 400 },
      );
    }

    const template = await getBlockTemplateNodeJsonById(validated.data.id);
    if (!template) {
      return NextResponse.json(
        { error: "テンプレートが見つかりません" },
        { status: 404 },
      );
    }

    return NextResponse.json(template);
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminBlockTemplateGet" },
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
