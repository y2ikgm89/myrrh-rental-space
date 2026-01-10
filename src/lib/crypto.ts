/**
 * 暗号化/復号化ユーティリティ
 *
 * AES-256-GCM を使用してセンシティブなデータを暗号化
 * 環境変数 ENCRYPTION_KEY が必要（32バイト = 64文字の16進数）
 *
 * キー生成: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const ENCODING = 'base64'

/**
 * 暗号化キーを取得
 */
function getEncryptionKey(): Buffer {
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
 * 平文を暗号化
 * @param plaintext - 暗号化する文字列
 * @returns 暗号化された文字列（Base64エンコード: iv:authTag:ciphertext）
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', ENCODING)
  encrypted += cipher.final(ENCODING)

  const authTag = cipher.getAuthTag()

  // フォーマット: iv:authTag:ciphertext (すべてBase64)
  return `${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted}`
}

/**
 * 暗号文を復号化
 * @param ciphertext - 暗号化された文字列（iv:authTag:ciphertext形式）
 * @returns 復号化された文字列
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()

  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format')
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts
  const iv = Buffer.from(ivBase64, ENCODING)
  const authTag = Buffer.from(authTagBase64, ENCODING)
  const encrypted = Buffer.from(encryptedBase64, ENCODING)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}

/**
 * 文字列が暗号化されたフォーマットかどうかを確認
 * @param value - チェックする文字列
 * @returns 暗号化フォーマットの場合true
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  const parts = value.split(':')
  if (parts.length !== 3) return false

  // Base64形式のIVとAuthTagの長さをチェック
  try {
    const iv = Buffer.from(parts[0], ENCODING)
    const authTag = Buffer.from(parts[1], ENCODING)
    return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH
  } catch {
    return false
  }
}

/**
 * 安全に暗号化（キーがない場合はnullを返す）
 */
export function safeEncrypt(plaintext: string): string | null {
  try {
    return encrypt(plaintext)
  } catch {
    console.warn('Encryption failed: ENCRYPTION_KEY may not be set')
    return null
  }
}

/**
 * 安全に復号化（失敗した場合はnullを返す）
 */
export function safeDecrypt(ciphertext: string): string | null {
  try {
    return decrypt(ciphertext)
  } catch {
    console.warn('Decryption failed')
    return null
  }
}
