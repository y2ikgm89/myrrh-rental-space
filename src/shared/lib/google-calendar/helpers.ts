import "server-only";

/**
 * Google APIエラーをユーザーフレンドリーなメッセージに変換
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

    return error.message;
  }

  return "Google Calendarとの通信中にエラーが発生しました";
}
