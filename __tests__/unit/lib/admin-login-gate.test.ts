import { describe, expect, test } from 'bun:test'
import {
  createAdminGateToken,
  isSignedAdminGateToken,
  verifyAdminGateToken,
} from '@/shared/lib/admin-login-gate'

describe('admin login gate token', () => {
  test('署名付き token を生成して検証できる', async () => {
    const { token } = await createAdminGateToken({
      nowMs: 1_700_000_000_000,
      nonce: 'fixed-nonce',
    })

    expect(isSignedAdminGateToken(token)).toBe(true)
    await expect(verifyAdminGateToken(token, 1_700_000_000_000)).resolves.toBe(
      true,
    )
  })

  test('有効期限切れ token は拒否する', async () => {
    const { token } = await createAdminGateToken({
      nowMs: 1_700_000_000_000,
      ttlMs: 1_000,
      nonce: 'expired-nonce',
    })

    await expect(verifyAdminGateToken(token, 1_700_000_002_000)).resolves.toBe(
      false,
    )
  })

  test('改ざんされた token は拒否する', async () => {
    const { token } = await createAdminGateToken({
      nowMs: 1_700_000_000_000,
      nonce: 'tamper-nonce',
    })

    const parts = token.split('.')
    const [payload, signature] = parts
    if (!payload || !signature || parts.length !== 2) {
      throw new Error('unexpected token shape')
    }

    const tamperedToken = `${payload}.tampered-signature`
    await expect(
      verifyAdminGateToken(tamperedToken, 1_700_000_000_000),
    ).resolves.toBe(false)
  })
})
