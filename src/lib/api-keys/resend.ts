/**
 * Resend API Key Management
 *
 * Resend接続テストと設定管理
 */

import { Resend } from 'resend'
import type { ApiKeyTestResult } from '@/types/api-keys'
import { isValidResendApiKey } from '@/lib/validations/api-keys'

/**
 * Resend APIへの接続をテスト
 * @param apiKey - Resend APIキー
 * @returns テスト結果
 */
export async function testResendConnection(
  apiKey: string
): Promise<ApiKeyTestResult> {
  if (!isValidResendApiKey(apiKey)) {
    return {
      success: false,
      error: 'APIキーの形式が正しくありません（re_ で始まる必要があります）',
    }
  }

  try {
    const resend = new Resend(apiKey)
    // domains.list() で読み取り専用のテスト（副作用なし）
    await resend.domains.list()

    return {
      success: true,
      message: 'Resend APIへの接続に成功しました',
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '接続テストに失敗しました'

    // よくあるエラーパターンをユーザーフレンドリーに変換
    if (message.includes('Invalid API Key')) {
      return {
        success: false,
        error: 'APIキーが無効です。Resendダッシュボードで確認してください',
      }
    }

    return {
      success: false,
      error: message,
    }
  }
}
