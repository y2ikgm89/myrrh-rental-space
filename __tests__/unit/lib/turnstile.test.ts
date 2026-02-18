/**
 * Turnstile 検証テスト
 *
 * DBベースの設定に対応
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
} from 'bun:test'

// モック用prismaクライアント（mock.module より前に定義してTDZを回避）
// 戻り型を union にしてテスト毎に mockResolvedValueOnce で上書き可能にする
const mockPrismaClient = {
  settings: {
    findUnique: mock<() => Promise<Record<string, string | null> | null>>(() => Promise.resolve(null)),
  },
}

// prismaモジュールをモック
mock.module('@/shared/lib/prisma', () => ({
  prisma: mockPrismaClient,
}))

// cryptoモジュールをモック（復号処理）
mock.module('@/shared/lib/crypto', () => ({
  decrypt: (value: string) => value, // 暗号化された値をそのまま返す（テスト用）
  isEncrypted: (_value: string) => true, // テスト用: 暗号化済みとみなす
}))

// モジュールモック
// typeof fetch は Bun の preconnect 等の付加プロパティを持つため直接指定しない
const mockFetch = mock(() => Promise.resolve(new Response()))

// テスト対象の関数をインポート前にfetchをモック
const originalFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  // prismaモックをリセット
  mockPrismaClient.settings.findUnique.mockClear()
})
afterEach(() => {
  globalThis.fetch = originalFetch
  mockFetch.mockClear()
})

describe('turnstile', () => {
  describe('verifyTurnstileToken', () => {
    test('シークレットキーが未設定の場合はtrueを返す（DBに設定なし）', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce(null)

      const { verifyTurnstileToken } = await import('@/shared/lib/turnstile')
      const result = await verifyTurnstileToken('test-token')

      expect(result).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('シークレットキーが空の場合はtrueを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: null,
      })

      const { verifyTurnstileToken } = await import('@/shared/lib/turnstile')
      const result = await verifyTurnstileToken('test-token')

      expect(result).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('トークンが空の場合はfalseを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: 'test-secret-key',
      })

      const { verifyTurnstileToken } = await import('@/shared/lib/turnstile')
      const result = await verifyTurnstileToken('')

      expect(result).toBe(false)
    })

    test('検証成功時はtrueを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: 'test-secret-key',
      })

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const { verifyTurnstileToken } = await import('@/shared/lib/turnstile')
      const result = await verifyTurnstileToken('valid-token')

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    test('検証失敗時はfalseを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: 'test-secret-key',
      })

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            'error-codes': ['invalid-input-response'],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

      const { verifyTurnstileToken } = await import('@/shared/lib/turnstile')
      const result = await verifyTurnstileToken('invalid-token')

      expect(result).toBe(false)
    })

    test('API エラー時はfalseを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: 'test-secret-key',
      })

      mockFetch.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      )

      const { verifyTurnstileToken } = await import('@/shared/lib/turnstile')
      const result = await verifyTurnstileToken('test-token')

      expect(result).toBe(false)
    })

    test('ネットワークエラー時はfalseを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: 'test-secret-key',
      })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { verifyTurnstileToken } = await import('@/shared/lib/turnstile')
      const result = await verifyTurnstileToken('test-token')

      expect(result).toBe(false)
    })
  })

  describe('isTurnstileEnabled', () => {
    test('両方のキーが設定されている場合はtrueを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSiteKey: 'site-key',
        turnstileSecretKey: 'secret-key',
      })

      const { isTurnstileEnabled } = await import('@/shared/lib/turnstile')
      const result = await isTurnstileEnabled()

      expect(result).toBe(true)
    })

    test('設定が存在しない場合はfalseを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce(null)

      const { isTurnstileEnabled } = await import('@/shared/lib/turnstile')
      const result = await isTurnstileEnabled()

      expect(result).toBe(false)
    })

    test('サイトキーが未設定の場合はfalseを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSiteKey: null,
        turnstileSecretKey: 'secret-key',
      })

      const { isTurnstileEnabled } = await import('@/shared/lib/turnstile')
      const result = await isTurnstileEnabled()

      expect(result).toBe(false)
    })

    test('シークレットキーが未設定の場合はfalseを返す', async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSiteKey: 'site-key',
        turnstileSecretKey: null,
      })

      const { isTurnstileEnabled } = await import('@/shared/lib/turnstile')
      const result = await isTurnstileEnabled()

      expect(result).toBe(false)
    })
  })
})
