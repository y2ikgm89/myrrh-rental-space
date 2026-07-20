import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { filterEnabledLinkCardContentTypes } from "@/shared/domain/link-cards/content-types";
import { getEnabledFeatures } from "@/shared/lib/features/check";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

/**
 * 「サイト内」リンクカードタブで選択可能な content-type 一覧を返す。
 *
 * Feature Module（spaces / events / posts / news）が OFF の content-type は
 * 除外される。公開ルートが `requireFeatureEnabled` で 404 ガードされているのに対し、
 * LinkCardPlugin の content-type セレクタは無条件に全種別を表示していたため
 * （無効な種別への新規リンク作成を防ぐ M 級 bug 修正）。
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkAdminAuth(request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, 401);
    }

    const enabledModules = await getEnabledFeatures();
    const contentTypes = filterEnabledLinkCardContentTypes(enabledModules);
    return jsonSuccess({ contentTypes });
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminLinkCardsContentTypesGet" },
    });
    return jsonError("Internal server error", 500);
  }
}
