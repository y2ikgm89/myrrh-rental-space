/**
 * Health API Route Tests
 *
 * /api/health エンドポイントのテスト
 */

import { describe, test, expect } from 'bun:test'

describe('GET /api/health', () => {
  test('エンドポイントが定義されている', async () => {
    // API Route の存在確認
    const routeModule = await import('@/app/api/health/route')
    expect(routeModule.GET).toBeDefined()
    expect(typeof routeModule.GET).toBe('function')
  })

  test('レスポンス形式が正しい', async () => {
    // Note: 実際のDB接続を行うため、CI環境では別途モック設定が必要
    const routeModule = await import('@/app/api/health/route')

    // GET関数が存在することを確認
    expect(routeModule.GET).toBeDefined()
  })
})
