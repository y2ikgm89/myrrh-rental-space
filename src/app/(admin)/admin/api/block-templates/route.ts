import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getBlockTemplates } from "@/shared/domain/block-template/queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

function getErrorStatus(message: string): number {
  if (message.includes("ログイン") || message.includes("権限")) {
    return 403;
  }

  return 400;
}

export async function GET(request: Request): Promise<NextResponse> {
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

    return NextResponse.json(await getBlockTemplates());
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminBlockTemplatesGet" },
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
