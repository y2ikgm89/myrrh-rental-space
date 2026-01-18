/**
 * 暗号化/復号化ユーティリティ
 *
 * AES-256-GCM + HKDF鍵導出を使用してセンシティブなデータを暗号化
 * 環境変数 ENCRYPTION_KEY が必要（32バイト = 64文字の16進数）
 *
 * セキュリティ機能:
 * - HKDF: マスターキーから目的別の派生鍵を自動生成
 * - AAD: 暗号化コンテキストの認証（改ざん検知強化）
 *
 * キー生成: openssl rand -hex 32
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
} from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const ENCODING: BufferEncoding = 'base64'
const VERSION = 1
const DEFAULT_PURPOSE = 'generic'

interface EncryptOptions {
  purpose?: string
}

/**
 * マスター暗号化キーを取得
 */
function getMasterKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate with: openssl rand -hex 32'
    )
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

/**
 * HKDF で派生鍵を生成
 */
function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  const salt = Buffer.from(`myrrh-rental-space:${purpose}`, 'utf8')
  const prk = createHmac('sha256', salt).update(masterKey).digest()

  const info = Buffer.from(`encryption:${purpose}:v${VERSION}`, 'utf8')
  return createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest()
}

/**
 * 平文を暗号化
 */
export function encrypt(plaintext: string, options?: EncryptOptions): string {
  const purpose = options?.purpose || DEFAULT_PURPOSE
  const derivedKey = deriveKey(getMasterKey(), purpose)
  const iv = randomBytes(IV_LENGTH)
  const aad = Buffer.from(`v${VERSION}:${purpose}`, 'utf8')

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv)
  cipher.setAAD(aad)

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING)
  encrypted += cipher.final(ENCODING)

  return `v${VERSION}:${purpose}:${iv.toString(ENCODING)}:${cipher.getAuthTag().toString(ENCODING)}:${encrypted}`
}

/**
 * 暗号文を復号化
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 5 || parts[0] !== `v${VERSION}`) {
    throw new Error('Invalid ciphertext format')
  }

  const [, purpose, ivBase64, authTagBase64, encryptedBase64] = parts
  const derivedKey = deriveKey(getMasterKey(), purpose)
  const aad = Buffer.from(`v${VERSION}:${purpose}`, 'utf8')

  const decipher = createDecipheriv(
    ALGORITHM,
    derivedKey,
    Buffer.from(ivBase64, ENCODING)
  )
  decipher.setAAD(aad)
  decipher.setAuthTag(Buffer.from(authTagBase64, ENCODING))

  let decrypted = decipher.update(Buffer.from(encryptedBase64, ENCODING))
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}

/**
 * 暗号化フォーマットかどうかを確認
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  const parts = value.split(':')
  if (parts.length !== 5 || parts[0] !== `v${VERSION}`) return false

  try {
    const iv = Buffer.from(parts[2], ENCODING)
    const authTag = Buffer.from(parts[3], ENCODING)
    return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH
  } catch {
    return false
  }
}

/**
 * 安全に暗号化
 */
export function safeEncrypt(
  plaintext: string,
  options?: EncryptOptions
): string | null {
  try {
    return encrypt(plaintext, options)
  } catch {
    console.warn('Encryption failed: ENCRYPTION_KEY may not be set')
    return null
  }
}

/**
 * 安全に復号化
 */
export function safeDecrypt(ciphertext: string): string | null {
  try {
    return decrypt(ciphertext)
  } catch {
    console.warn('Decryption failed')
    return null
  }
}

/**
 * APIキー用の暗号化
 */
export function encryptApiKey(plaintext: string): string {
  return encrypt(plaintext, { purpose: 'api-key' })
}

/**
 * Stripe関連データ用の暗号化
 */
export function encryptStripeData(plaintext: string): string {
  return encrypt(plaintext, { purpose: 'stripe' })
}
