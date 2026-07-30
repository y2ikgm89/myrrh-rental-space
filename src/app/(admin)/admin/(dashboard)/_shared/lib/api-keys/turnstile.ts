/**
 * Cloudflare Turnstile API Key Management
 *
 * Turnstile接続テストと設定管理
 */

import type { ApiKeyTestResult } from "@/admin/types/api-keys";
import { isValidTurnstileKey } from "@/admin/lib/validations/api-keys";

/**
 * Turnstile設定の検証
 *
 * Note: Turnstileは実際のフォーム送信時にしかテストできないため、
 * ここではキー形式の検証のみ行う
 *
 * @param siteKey - Turnstile Site Key
 * @param secretKey - Turnstile Secret Key
 * @returns テスト結果
 *
 * Note: 形式検証のみの同期処理のため async ではない（Resend/GoogleMaps/SwitchBot の
 * 同種 test*Connection とは異なり実際の外部 API 呼び出しを行わない）。
 */
export function testTurnstileConnection(
  siteKey: string,
  secretKey: string,
): ApiKeyTestResult {
  // Site Keyの形式検証
  if (!isValidTurnstileKey(siteKey)) {
    return {
      success: false,
      error: "Site Keyの形式が正しくありません",
    };
  }

  // Secret Keyの形式検証
  if (!isValidTurnstileKey(secretKey)) {
    return {
      success: false,
      error: "Secret Keyの形式が正しくありません",
    };
  }

  // 形式検証のみで成功
  // 実際のテストはフォーム送信時に行われる
  return {
    success: true,
    message: "キーの形式検証に成功しました",
    metadata: {
      note: "Turnstileは実際のフォーム送信時に検証されます",
    },
  };
}
