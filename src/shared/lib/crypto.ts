/**
 * 暗号化/復号化ユーティリティ
 *
 * AES-256-GCM + HKDF鍵導出を使用してセンシティブなデータを暗号化します。
 * APIキー、Stripeデータなど機密情報の保存に使用します。
 *
 * ## 必要な環境変数
 * - `ENCRYPTION_KEY`: 32バイト（64文字の16進数）
 *
 * ## セキュリティ機能
 * - **HKDF**: マスターキーから目的別の派生鍵を自動生成
 * - **AAD**: 暗号化コンテキストの認証（改ざん検知強化）
 * - **GCM**: 認証付き暗号化モード
 *
 * ## キー生成コマンド
 * ```bash
 * openssl rand -hex 32
 * ```
 *
 * @module shared/lib/crypto
 */

import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
} from "crypto";
import { logError, ErrorCategory, ErrorSeverity } from "./errors/server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCODING: BufferEncoding = "base64";
const VERSION = 1;
const DEFAULT_PURPOSE = "generic";

interface EncryptOptions {
  purpose?: string;
}

/**
 * マスター暗号化キーを取得
 */
function getMasterKey(): Buffer {
  const key = process.env["ENCRYPTION_KEY"];
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate with: openssl rand -hex 32",
    );
  }
  // Length is guaranteed by Zod schema (.length(64)) validated at startup
  return Buffer.from(key, "hex");
}

/**
 * HKDF で派生鍵を生成
 */
function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  const salt = Buffer.from(`myrrh-rental-space:${purpose}`, "utf8");
  const prk = createHmac("sha256", salt).update(masterKey).digest();

  const info = Buffer.from(`encryption:${purpose}:v${VERSION}`, "utf8");
  return createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest();
}

/**
 * 平文を暗号化
 */
export function encrypt(plaintext: string, options?: EncryptOptions): string {
  const purpose = options?.purpose || DEFAULT_PURPOSE;
  const derivedKey = deriveKey(getMasterKey(), purpose);
  const iv = randomBytes(IV_LENGTH);
  const aad = Buffer.from(`v${VERSION}:${purpose}`, "utf8");

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  cipher.setAAD(aad);

  let encrypted = cipher.update(plaintext, "utf8", ENCODING);
  encrypted += cipher.final(ENCODING);

  return `v${VERSION}:${purpose}:${iv.toString(ENCODING)}:${cipher.getAuthTag().toString(ENCODING)}:${encrypted}`;
}

/**
 * 暗号文を復号化
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 5 || parts[0] !== `v${VERSION}`) {
    throw new Error("Invalid ciphertext format");
  }

  const purpose = parts[1];
  const ivBase64 = parts[2];
  const authTagBase64 = parts[3];
  const encryptedBase64 = parts[4];
  if (!purpose || !ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Invalid ciphertext format");
  }
  const derivedKey = deriveKey(getMasterKey(), purpose);
  const aad = Buffer.from(`v${VERSION}:${purpose}`, "utf8");

  const decipher = createDecipheriv(
    ALGORITHM,
    derivedKey,
    Buffer.from(ivBase64, ENCODING),
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(authTagBase64, ENCODING));

  let decrypted = decipher.update(Buffer.from(encryptedBase64, ENCODING));
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * 暗号化フォーマットかどうかを確認
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== `v${VERSION}`) return false;

  try {
    const ivPart = parts[2];
    const authTagPart = parts[3];
    if (!ivPart || !authTagPart) return false;
    const iv = Buffer.from(ivPart, ENCODING);
    const authTag = Buffer.from(authTagPart, ENCODING);
    return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * 安全に暗号化
 */
export function safeEncrypt(
  plaintext: string,
  options?: EncryptOptions,
): string | null {
  try {
    return encrypt(plaintext, options);
  } catch (error) {
    logError(error instanceof Error ? error : new Error("Encryption failed"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "safeEncrypt", purpose: options?.purpose },
    });
    return null;
  }
}

/**
 * 安全に復号化
 */
export function safeDecrypt(ciphertext: string): string | null {
  try {
    return decrypt(ciphertext);
  } catch (error) {
    logError(error instanceof Error ? error : new Error("Decryption failed"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "safeDecrypt" },
    });
    return null;
  }
}

/**
 * APIキー用の暗号化
 */
export function encryptApiKey(plaintext: string): string {
  return encrypt(plaintext, { purpose: "api-key" });
}

/**
 * Stripe関連データ用の暗号化
 */
export function encryptStripeData(plaintext: string): string {
  return encrypt(plaintext, { purpose: "stripe" });
}
