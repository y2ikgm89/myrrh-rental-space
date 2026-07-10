/**
 * SwitchBot API Key Management
 *
 * SwitchBot接続テストと設定管理
 */

import type { ApiKeyTestResult } from "@/admin/types/api-keys";
import { getDeviceList } from "@/shared/lib/smart-lock/switchbot-client";

/**
 * SwitchBot APIへの接続をテスト
 *
 * Turnstileと異なり形式検証だけでなく、デバイス一覧取得APIを実際に呼び出して
 * 疎通確認を行う。
 *
 * @param openToken - SwitchBot Open Token
 * @param secretKey - SwitchBot Secret Key
 * @returns テスト結果
 */
export async function testSwitchBotConnection(
  openToken: string,
  secretKey: string,
): Promise<ApiKeyTestResult> {
  const result = await getDeviceList({ openToken, secretKey });

  if (!result.ok) {
    return {
      success: false,
      error: `API接続エラー: ${result.message}`,
    };
  }

  return {
    success: true,
    message: "SwitchBot APIへの接続に成功しました",
    metadata: {
      deviceCount: result.body.deviceList.length,
    },
  };
}
