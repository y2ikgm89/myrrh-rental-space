/**
 * Cloudflare CDN API Key Management
 *
 * Cloudflare接続テストとキャッシュパージ設定管理
 */

import { z } from "zod";

import type { ApiKeyTestResult } from "@/admin/types/api-keys";
import {
  isValidCloudflareZoneId,
  isValidCloudflareApiToken,
} from "@/admin/lib/validations/api-keys";

/**
 * Zone 詳細取得 API レスポンスのうち接続テストで参照するフィールドのみを検証する schema。
 * 外部 API レスポンスは `unknown` で受けて `safeParse` で narrow する
 * （`@/shared/lib/turnstile` / `@/shared/lib/cloudflare` と同方針）。
 */
const cloudflareZoneResponseSchema = z.object({
  success: z.boolean(),
  result: z
    .object({
      name: z.string().optional(),
      plan: z.object({ name: z.string().optional() }).optional(),
    })
    .nullish(),
  errors: z
    .array(
      z.object({
        code: z.number().optional(),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Cloudflare APIへの接続をテスト
 *
 * Zone詳細取得APIを使用した接続テストを実行
 *
 * @param zoneId - Cloudflare Zone ID
 * @param apiToken - Cloudflare API Token
 * @returns テスト結果
 */
export async function testCloudflareConnection(
  zoneId: string,
  apiToken: string,
): Promise<ApiKeyTestResult> {
  if (!isValidCloudflareZoneId(zoneId)) {
    return {
      success: false,
      error: "Zone IDの形式が正しくありません（32文字の16進数が必要です）",
    };
  }

  if (!isValidCloudflareApiToken(apiToken)) {
    return {
      success: false,
      error: "API Tokenの形式が正しくありません",
    };
  }

  try {
    // Zone詳細取得APIでテスト（読み取り専用、コスト低）
    const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000), // 10秒タイムアウト
    });

    const rawData: unknown = await response.json();
    const parsed = cloudflareZoneResponseSchema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        error: "Cloudflare API から予期しない形式の応答が返されました",
      };
    }
    const data = parsed.data;

    if (data.success) {
      const zoneName = data.result?.name || "Unknown";
      return {
        success: true,
        message: `Cloudflare APIへの接続に成功しました (Zone: ${zoneName})`,
        metadata: {
          zoneName,
          plan: data.result?.plan?.name,
        },
      };
    }

    // エラーメッセージの解析
    const errors = data.errors || [];
    if (errors.length > 0) {
      const errorCode = errors[0]?.code;
      const errorMessage = errors[0]?.message || "不明なエラー";

      switch (errorCode) {
        case 6003: // Invalid request headers
        case 6111: // Invalid format
          return {
            success: false,
            error: `認証エラー: ${errorMessage}`,
          };
        case 7000: // Zone not found
        case 7003: // Could not route to zone
          return {
            success: false,
            error: "Zone IDが見つかりません。正しいZone IDを入力してください",
          };
        case 9109: // Invalid access token
          return {
            success: false,
            error: "API Tokenが無効です。トークンの権限を確認してください",
          };
        default:
          return {
            success: false,
            error: `API接続エラー: ${errorMessage} (code: ${errorCode})`,
          };
      }
    }

    return {
      success: false,
      error: "API接続に失敗しました",
    };
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
