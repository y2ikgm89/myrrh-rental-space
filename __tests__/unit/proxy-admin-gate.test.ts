import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

describe('proxy admin gate', () => {
  test('token query がある /admin/login は route 側の検証へ通す', async () => {
    const response = await proxy(
      new NextRequest('https://example.com/admin/login?token=plain-token'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-pathname')).toBe('/admin/login')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('token も gate cookie もない /admin/login は 404 にする', async () => {
    const response = await proxy(new NextRequest('https://example.com/admin/login'))

    expect(response.status).toBe(404)
  })

  test('session cookie がなくても /admin/setup/[token] は通す', async () => {
    const response = await proxy(
      new NextRequest('https://example.com/admin/setup/invitation-token'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-pathname')).toBe('/admin/setup/invitation-token')
  })

  test('session cookie がない /admin/* は login に redirect する', async () => {
    const response = await proxy(new NextRequest('https://example.com/admin/posts'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/admin/login')
  })
})
