import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { isEditorRole } from "@/admin/lib/permissions";
import { getDeletedPagesListQuery } from "@/shared/domain/pages/admin-queries";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
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
    const auth = await checkPermission("page", "read", request.headers);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error.error },
        { status: getErrorStatus(auth.error.error) },
      );
    }

    const allowedPageIds = isEditorRole(auth.user.role)
      ? await getAssignedPageIdsForUser(auth.user.id)
      : undefined;
    const pages = await getDeletedPagesListQuery(allowedPageIds);

    return NextResponse.json(pages);
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminDeletedPagesGet" },
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
