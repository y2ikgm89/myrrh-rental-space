/**
 * Resend API Key Management
 *
 * Resend接続テストと設定管理
 */

import { Resend } from "resend";
import type { ApiKeyTestResult } from "@/admin/types/api-keys";
import { isValidResendApiKey } from "@/admin/lib/validations/api-keys";

/**
 * Resend APIへの接続をテスト
 * @param apiKey - Resend APIキー
 * @returns テスト結果
 */
export async function testResendConnection(
  apiKey: string,
): Promise<ApiKeyTestResult> {
  if (!isValidResendApiKey(apiKey)) {
    return {
      success: false,
      error: "APIキーの形式が正しくありません（re_ で始まる必要があります）",
    };
  }

  const resend = new Resend(apiKey);
  // domains.list() で読み取り専用のテスト（副作用なし）
  // Resend SDK v3+ は例外を投げず { data, error } を返す
  const { error } = await resend.domains.list();

  if (error) {
    const isInvalidKey =
      error.message.includes("Invalid API Key") ||
      error.name === "invalid_api_key";

    return {
      success: false,
      error: isInvalidKey
        ? "APIキーが無効です。正しいキーを入力してください。"
        : "接続テストに失敗しました。しばらく経ってから再試行してください。",
    };
  }

  return {
    success: true,
    message: "Resend APIへの接続に成功しました",
  };
}
