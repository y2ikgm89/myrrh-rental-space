import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { createAdminGateToken } from '@/shared/lib/admin-login-gate'

describe('proxy admin gate', () => {
  test('署名付き token で /admin/login に入れる', async () => {
    const { token } = await createAdminGateToken({
      nowMs: Date.now(),
      nonce: 'proxy-test-token',
    })

    const response = await proxy(
      new NextRequest(`https://example.com/admin/login?token=${token}`),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/admin/login')
    expect(response.headers.get('set-cookie')).toContain('admin-gate=1')
  })

  test('不正な token では /admin/login を 404 にする', async () => {
    const response = await proxy(
      new NextRequest('https://example.com/admin/login?token=plain-token'),
    )

    expect(response.status).toBe(404)
  })

  test('session cookie がない /admin/* は login に redirect する', async () => {
    const response = await proxy(new NextRequest('https://example.com/admin/posts'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/admin/login')
  })
})
