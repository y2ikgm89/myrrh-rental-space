/**
 * ヘルスチェック API（監視・手動確認用）
 *
 * DB 疎通を含む詳細ヘルスチェック。Cloud Run の startup/liveness probe には
 * 使用しない（DB 一時断でコンテナが連鎖 kill されるため）。probe は `/api/live` を使う。
 *
 * セキュリティ上、レスポンスは `status` + `timestamp` のみ。
 * DB 接続状態・レスポンス時間・バージョン等の内部インフラ情報は露出しない
 * （攻撃者のインフラ偵察対策）。
 *
 * @module api/health
 */

import { connection, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { runDatabaseHealthCheck } from "@/shared/domain/system/queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

const noCacheHeaders = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
} as const;

export async function GET() {
  await connection();

  try {
    await runDatabaseHealthCheck();

    return NextResponse.json(
      { status: "healthy", timestamp: new Date().toISOString() },
      { status: 200, headers: noCacheHeaders },
    );
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.CRITICAL,
      context: { operation: "healthCheck" },
    });

    return NextResponse.json(
      { status: "unhealthy", timestamp: new Date().toISOString() },
      { status: 503, headers: noCacheHeaders },
    );
  }
}
