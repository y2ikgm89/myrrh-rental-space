import "server-only";

import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

const GENERIC_MESSAGE = "Google Calendarとの通信中にエラーが発生しました";

/**
 * Google APIエラーをユーザーフレンドリーなメッセージに変換する。
 *
 * 既知のエラーパターン（invalid_grant / not found / forbidden / invalid_client / quota）は
 * 日本語の対処メッセージにマップする。それ以外は generic メッセージを返し、
 * GCP project ID / service account email / 内部 URL 等のインフラ詳細が
 * 管理 UI / API レスポンスに漏洩することを防ぐ（2026-05-07 clean-break）。
 *
 * 詳細は server-side `logError` で保持されるため、運用時の調査は
 * Cloud Logging から `category=EXTERNAL_API operation=formatGoogleApiError` を辿る。
 */
export function formatGoogleApiError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("invalid_grant")) {
      return "サービスアカウント認証情報が無効です";
    }
    if (message.includes("not found") || message.includes("notfound")) {
      return "カレンダーが見つかりません。カレンダーIDを確認してください";
    }
    if (message.includes("forbidden") || message.includes("403")) {
      return "カレンダーへのアクセス権限がありません。サービスアカウントに編集権限を付与してください";
    }
    if (message.includes("invalid_client")) {
      return "クライアント認証に失敗しました";
    }
    if (message.includes("quota")) {
      return "APIクォータを超過しました。しばらく待ってから再試行してください";
    }
  }

  logError(normalizeError(error), {
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "formatGoogleApiError" },
  });
  return GENERIC_MESSAGE;
}
