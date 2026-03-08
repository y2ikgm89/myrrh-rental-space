import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import {
  getICalFeedSettings,
  getICalTokens,
} from "@/shared/domain/settings/admin-queries";
import { getSpacesQuery } from "@/shared/domain/spaces/queries";
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
    const auth = await checkPermission("settings", "read", request.headers);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error.error },
        { status: getErrorStatus(auth.error.error) },
      );
    }

    const [tokens, settings, spaces] = await Promise.all([
      getICalTokens(),
      getICalFeedSettings(),
      getSpacesQuery({ isPublished: true }, { page: 1, limit: 100 }),
    ]);

    return NextResponse.json({
      tokens,
      settings,
      spaces: spaces.spaces.map((space) => ({
        id: space.id,
        name: space.name,
      })),
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminICalFeedGet" },
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
