/**
 * 暗号化/復号化ユーティリティテスト
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  encrypt,
  decrypt,
  isEncrypted,
  safeEncrypt,
  safeDecrypt,
  encryptApiKey,
  encryptStripeData,
} from '@/shared/lib/crypto'

describe('crypto', () => {
  const originalKey = process.env.ENCRYPTION_KEY
  // テスト用の有効なキー（64文字の16進数）
  const testKey = 'a'.repeat(64)

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = testKey
  })

  afterAll(() => {
    if (originalKey) {
      process.env.ENCRYPTION_KEY = originalKey
    } else {
      delete process.env.ENCRYPTION_KEY
    }
  })

  describe('encrypt / decrypt', () => {
    test('平文を暗号化して復号化できる', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    test('日本語を暗号化して復号化できる', () => {
      const plaintext = 'こんにちは、世界！'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    test('長いテキストを暗号化して復号化できる', () => {
      const plaintext = 'a'.repeat(10000)
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    test('JSONを暗号化して復号化できる', () => {
      const data = {
        type: 'service_account',
        project_id: 'test-project',
        private_key: 'secret-key',
      }
      const plaintext = JSON.stringify(data)
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(JSON.parse(decrypted)).toEqual(data)
    })

    test('purpose を指定して暗号化できる', () => {
      const plaintext = 'secret data'
      const encrypted = encrypt(plaintext, { purpose: 'custom-purpose' })

      // 暗号化されたデータにpurposeが含まれる
      expect(encrypted).toContain(':custom-purpose:')

      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    test('同じ平文でも毎回異なる暗号文になる（IV）', () => {
      const plaintext = 'same text'
      const encrypted1 = encrypt(plaintext)
      const encrypted2 = encrypt(plaintext)

      expect(encrypted1).not.toBe(encrypted2)

      // ただし両方とも正しく復号化できる
      expect(decrypt(encrypted1)).toBe(plaintext)
      expect(decrypt(encrypted2)).toBe(plaintext)
    })

    test('不正な暗号文はエラーを投げる', () => {
      expect(() => decrypt('invalid')).toThrow()
      expect(() => decrypt('v1:a:b:c')).toThrow() // パーツが足りない
      expect(() => decrypt('v2:test:a:b:c')).toThrow() // 不正なバージョン
    })

    test('改ざんされた暗号文はエラーを投げる', () => {
      const encrypted = encrypt('secret')
      const parts = encrypted.split(':')
      // 暗号文部分を改ざん
      parts[4] = 'tampered'
      const tampered = parts.join(':')

      expect(() => decrypt(tampered)).toThrow()
    })
  })

  describe('isEncrypted', () => {
    test('暗号化された値はtrueを返す', () => {
      const encrypted = encrypt('test')
      expect(isEncrypted(encrypted)).toBe(true)
    })

    test('暗号化されていない値はfalseを返す', () => {
      expect(isEncrypted('plain text')).toBe(false)
      expect(isEncrypted('')).toBe(false)
      expect(isEncrypted('v1:test')).toBe(false)
      expect(isEncrypted('v1:a:b:c:d:e')).toBe(false) // パーツが多すぎる
    })

    test('不正なBase64はfalseを返す', () => {
      expect(isEncrypted('v1:test:!!!invalid!!!:abcd:efgh')).toBe(false)
    })
  })

  describe('safeEncrypt / safeDecrypt', () => {
    test('正常に暗号化・復号化できる', () => {
      const plaintext = 'safe test'
      const encrypted = safeEncrypt(plaintext)

      expect(encrypted).not.toBeNull()
      expect(safeDecrypt(encrypted!)).toBe(plaintext)
    })

    test('safeDecrypt は不正な値に対してnullを返す', () => {
      expect(safeDecrypt('invalid')).toBeNull()
    })

    test('safeEncrypt は環境変数が無い場合nullを返す', () => {
      const originalKey = process.env.ENCRYPTION_KEY
      delete process.env.ENCRYPTION_KEY

      const result = safeEncrypt('test')
      expect(result).toBeNull()

      process.env.ENCRYPTION_KEY = originalKey || testKey
    })
  })

  describe('encryptApiKey', () => {
    test('APIキーを暗号化できる', () => {
      const apiKey = 'sk_test_1234567890'
      const encrypted = encryptApiKey(apiKey)

      // purpose が 'api-key' である
      expect(encrypted).toContain(':api-key:')

      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(apiKey)
    })
  })

  describe('encryptStripeData', () => {
    test('Stripeデータを暗号化できる', () => {
      const stripeData = 'acct_1234567890'
      const encrypted = encryptStripeData(stripeData)

      // purpose が 'stripe' である
      expect(encrypted).toContain(':stripe:')

      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(stripeData)
    })
  })
})
