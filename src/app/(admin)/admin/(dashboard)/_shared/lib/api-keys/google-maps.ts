/**
 * Google Maps API Key Management
 *
 * Google Maps接続テストと設定管理
 */

import { z } from "zod";

import type { ApiKeyTestResult } from "@/admin/types/api-keys";
import { isValidGoogleMapsApiKey } from "@/admin/lib/validations/api-keys";

/**
 * Geocoding API レスポンスのうち接続テストで参照するフィールドのみを検証する schema。
 * 外部 API レスポンスは `unknown` で受けて `safeParse` で narrow する
 * （`@/shared/lib/turnstile` / `@/shared/lib/cloudflare` と同方針）。
 */
const geocodeResponseSchema = z.object({
  status: z.string(),
  error_message: z.string().optional(),
});

/**
 * Google Maps APIへの接続をテスト
 *
 * Geocoding APIを使用した軽量なテストリクエストを送信
 *
 * @param apiKey - Google Maps APIキー
 * @returns テスト結果
 */
export async function testGoogleMapsConnection(
  apiKey: string,
): Promise<ApiKeyTestResult> {
  if (!isValidGoogleMapsApiKey(apiKey)) {
    return {
      success: false,
      error: "APIキーの形式が正しくありません（AIza で始まる必要があります）",
    };
  }

  try {
    // Geocoding APIでテストリクエスト
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Tokyo&key=${apiKey}`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10000), // 10秒タイムアウト
    });

    const rawData: unknown = await response.json();
    const parsed = geocodeResponseSchema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        error: "Google Maps API から予期しない形式の応答が返されました",
      };
    }
    const data = parsed.data;

    switch (data.status) {
      case "OK":
        return {
          success: true,
          message: "Google Maps APIへの接続に成功しました",
        };

      case "REQUEST_DENIED":
        return {
          success: false,
          error: `API接続エラー: ${data.error_message || "リクエストが拒否されました。APIキーの権限を確認してください"}`,
        };

      case "OVER_QUERY_LIMIT":
        return {
          success: false,
          error:
            "APIクォータを超過しています。Google Cloud Consoleで確認してください",
        };

      case "INVALID_REQUEST":
        return {
          success: false,
          error: "リクエストが無効です",
        };

      default:
        return {
          success: false,
          error: `API接続エラー: ${data.status}`,
        };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        success: false,
        error: "接続がタイムアウトしました",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "接続テストに失敗しました",
    };
  }
}
