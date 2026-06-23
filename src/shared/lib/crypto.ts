/**
 * 暗号化/復号化ユーティリティ（AES-256-GCM + HKDF + kid）
 *
 * APIキー、Stripeデータ、OAuth トークン、ゲストキャンセルトークンなど機密情報の
 * at-rest 暗号化に使用します。
 *
 * ## ワイヤ形式
 *
 * **v2（現行）**: `v2:<kid>:<purpose>:<iv_b64>:<authTag_b64>:<ct_b64>`
 *   - `<kid>` で復号時に使用する鍵を識別 → 鍵ローテーション対応
 *   - HKDF info / AAD には `purpose` のみ含める（kid は鍵選択にのみ使う）
 *
 * **v1（legacy・decrypt のみ受け入れ）**: `v1:<purpose>:<iv_b64>:<authTag_b64>:<ct_b64>`
 *   - kid 概念なし。primary key で復号を試みる（旧暗号文の互換性のため）
 *   - 新規 encrypt では絶対に出力しない
 *
 * ## 鍵ローテーション手順
 *
 *   1. 新マスター鍵を `openssl rand -hex 32` で発行
 *   2. 旧鍵を `ENCRYPTION_KEYS_LEGACY="<旧 kid>:<旧 hex>"` に移動
 *   3. `ENCRYPTION_KEY=<新 hex>` + `ENCRYPTION_KEY_ID=<新 kid>` で deploy
 *   4. バックグラウンド job で at-rest 暗号文を順次 re-encrypt（新鍵で上書き）
 *   5. 全データ移行後、`ENCRYPTION_KEYS_LEGACY` を空にして deploy
 *
 * 詳細は `docs/runbooks/encryption-key-rotation.md` を参照。
 *
 * ## セキュリティ機能
 * - **HKDF**: マスターキーから purpose 別の派生鍵を自動生成
 * - **AAD**: 暗号化コンテキスト（version + purpose）の認証
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
import {
  DEFAULT_KID,
  findEncryptionKeyByKid,
  getPrimaryEncryptionKey,
  type EncryptionKey,
} from "./env/encryption";
import { logError, ErrorCategory, ErrorSeverity } from "./errors/server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCODING: BufferEncoding = "base64";
const WIRE_V1 = "v1";
const WIRE_V2 = "v2";
const DEFAULT_PURPOSE = "generic";

interface EncryptOptions {
  purpose?: string;
}

/**
 * HKDF で派生鍵を生成（purpose ベース）。
 *
 * 注: kid は HKDF info に含めない。kid は wire format 上での鍵識別のためのみで、
 * 派生鍵の入力（master key）が鍵ローテーションで変わることで結果的に派生鍵も変わる。
 * kid を info に入れると同一 master でも kid 変更で派生鍵が変わってしまい意図と外れる。
 */
function deriveKey(masterKeyHex: string, purpose: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  const salt = Buffer.from(`myrrh-rental-space:${purpose}`, "utf8");
  const prk = createHmac("sha256", salt).update(masterKey).digest();

  const info = Buffer.from(`encryption:${purpose}:${WIRE_V1}`, "utf8");
  return createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest();
}

/**
 * 平文を暗号化（v2 形式: kid 入り）。
 */
export function encrypt(plaintext: string, options?: EncryptOptions): string {
  const purpose = options?.purpose || DEFAULT_PURPOSE;
  const primary = getPrimaryEncryptionKey();
  const derivedKey = deriveKey(primary.hex, purpose);
  const iv = randomBytes(IV_LENGTH);
  const aad = Buffer.from(`${WIRE_V2}:${purpose}`, "utf8");

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  cipher.setAAD(aad);

  let encrypted = cipher.update(plaintext, "utf8", ENCODING);
  encrypted += cipher.final(ENCODING);

  return `${WIRE_V2}:${primary.kid}:${purpose}:${iv.toString(ENCODING)}:${cipher.getAuthTag().toString(ENCODING)}:${encrypted}`;
}

interface ParsedCiphertext {
  version: typeof WIRE_V1 | typeof WIRE_V2;
  kid: string;
  purpose: string;
  iv: Buffer;
  authTag: Buffer;
  ct: Buffer;
}

/**
 * Wire format を parse。invalid format は throw。
 */
function parseCiphertext(ciphertext: string): ParsedCiphertext {
  const parts = ciphertext.split(":");
  const version = parts[0];

  if (version === WIRE_V2) {
    if (parts.length !== 6) {
      throw new Error("Invalid v2 ciphertext format");
    }
    const [, kid, purpose, ivB64, authTagB64, ctB64] = parts;
    if (!kid || !purpose || !ivB64 || !authTagB64 || !ctB64) {
      throw new Error("Invalid v2 ciphertext format");
    }
    return {
      version: WIRE_V2,
      kid,
      purpose,
      iv: Buffer.from(ivB64, ENCODING),
      authTag: Buffer.from(authTagB64, ENCODING),
      ct: Buffer.from(ctB64, ENCODING),
    };
  }

  if (version === WIRE_V1) {
    if (parts.length !== 5) {
      throw new Error("Invalid v1 ciphertext format");
    }
    const [, purpose, ivB64, authTagB64, ctB64] = parts;
    if (!purpose || !ivB64 || !authTagB64 || !ctB64) {
      throw new Error("Invalid v1 ciphertext format");
    }
    // v1 には kid 概念がない → primary key で復号を試みる（旧データの互換性のため）
    return {
      version: WIRE_V1,
      kid: DEFAULT_KID,
      purpose,
      iv: Buffer.from(ivB64, ENCODING),
      authTag: Buffer.from(authTagB64, ENCODING),
      ct: Buffer.from(ctB64, ENCODING),
    };
  }

  throw new Error(`Unsupported ciphertext version: ${version ?? "(none)"}`);
}

/**
 * 暗号文を復号化。v1 / v2 を自動判別し、v2 は kid に従って primary or legacy 鍵で復号。
 */
export function decrypt(ciphertext: string): string {
  const parsed = parseCiphertext(ciphertext);

  // v1 は kid 概念がないので primary key で復号を試みる。
  // v2 は wire 内 kid で primary or legacy を解決。
  const key: EncryptionKey | null =
    parsed.version === WIRE_V1
      ? getPrimaryEncryptionKey()
      : findEncryptionKeyByKid(parsed.kid);

  if (!key) {
    throw new Error(
      `No encryption key available for kid="${parsed.kid}" (legacy keys exhausted?)`,
    );
  }

  const derivedKey = deriveKey(key.hex, parsed.purpose);
  // AAD は wire version に合わせる（v1 は "v1:purpose"、v2 は "v2:purpose"）
  const aad = Buffer.from(`${parsed.version}:${parsed.purpose}`, "utf8");

  const decipher = createDecipheriv(ALGORITHM, derivedKey, parsed.iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(parsed.authTag);

  let decrypted = decipher.update(parsed.ct);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * 暗号化フォーマットかどうかを確認（v1 / v2 両対応）。
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = parseCiphertext(value);
    return (
      parsed.iv.length === IV_LENGTH &&
      parsed.authTag.length === AUTH_TAG_LENGTH
    );
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

/**
 * Google OAuth トークン用の暗号化（access_token / refresh_token 共通）
 *
 * Better Auth が `Account` テーブルに直書きする token は plaintext のため、
 * application 層境界（`getGoogleOAuthAccount` / `updateGoogleOAuthAccountTokens`）で
 * transparent encryption を施し、漸進的に at-rest 暗号化済み状態へ収束させる。
 */
export function encryptOAuthToken(plaintext: string): string {
  return encrypt(plaintext, { purpose: "oauth-google" });
}

/**
 * 既存 ciphertext が **primary 鍵で暗号化されているか** を判定。
 *
 * at-rest re-encrypt バックグラウンド job 用。`true` ならそのまま、`false`（legacy 鍵
 * もしくは v1 形式）なら decrypt → encrypt で primary 化する。
 */
export function isEncryptedWithPrimary(ciphertext: string): boolean {
  if (!isEncrypted(ciphertext)) return false;
  try {
    const parsed = parseCiphertext(ciphertext);
    if (parsed.version === WIRE_V1) return false;
    const primary = getPrimaryEncryptionKey();
    return parsed.kid === primary.kid;
  } catch {
    return false;
  }
}
