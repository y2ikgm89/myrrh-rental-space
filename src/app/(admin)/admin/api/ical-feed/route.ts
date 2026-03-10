import type { NextResponse } from "next/server";
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
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
} from "@/shared/lib/route-responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission("settings", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const [tokens, settings, spaces] = await Promise.all([
      getICalTokens(),
      getICalFeedSettings(),
      getSpacesQuery({ isPublished: true }, { page: 1, limit: 100 }),
    ]);

    return jsonSuccess({
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

    return jsonError("Internal server error", 500);
  }
}
