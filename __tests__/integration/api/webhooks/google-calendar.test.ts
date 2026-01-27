/**
 * Google Calendar Webhook API Route Tests
 *
 * /api/webhooks/google-calendar エンドポイントのテスト
 */

import { describe, test, expect } from 'bun:test'

describe('GET /api/webhooks/google-calendar', () => {
  test('エンドポイントが定義されている', async () => {
    const routeModule = await import('@/app/api/webhooks/google-calendar/route')
    expect(routeModule.GET).toBeDefined()
    expect(typeof routeModule.GET).toBe('function')
  })

  test('エンドポイント確認レスポンスを返す', async () => {
    const routeModule = await import('@/app/api/webhooks/google-calendar/route')

    // GET関数を引数なしで呼び出せることを確認
    const response = await routeModule.GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
    expect(data.message).toContain('ready')
  })
})

describe('POST /api/webhooks/google-calendar', () => {
  test('エンドポイントが定義されている', async () => {
    const routeModule = await import('@/app/api/webhooks/google-calendar/route')
    expect(routeModule.POST).toBeDefined()
    expect(typeof routeModule.POST).toBe('function')
  })

  test('必須ヘッダーがない場合は400を返す', async () => {
    const routeModule = await import('@/app/api/webhooks/google-calendar/route')

    const request = new Request('http://localhost/api/webhooks/google-calendar', {
      method: 'POST',
      headers: {},
    })

    const response = await routeModule.POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request')
  })
})
