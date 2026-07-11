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
import { getPrimaryEncryptionKey, type EncryptionKey } from "./env/encryption";
import { logError, ErrorCategory, ErrorSeverity } from "./errors/server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCODING: BufferEncoding = "base64";
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
 *
 * 注: 戻り値は常に SHA-256 の出力そのまま（32バイト = AES-256 の鍵長）。
 * HKDF-Expand の T(1) のみで完結する単一ブロック実装であり、33バイト以上の
 * 鍵長を要求する用途には転用できない（T(2) 以降のマルチブロック拡張が無い）。
 */
function deriveKey(masterKeyHex: string, purpose: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  const salt = Buffer.from(`myrrh-rental-space:${purpose}`, "utf8");
  const prk = createHmac("sha256", salt).update(masterKey).digest();

  const info = Buffer.from(`encryption:${purpose}:${WIRE_V2}`, "utf8");
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
  version: typeof WIRE_V2;
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

  if (version !== WIRE_V2) {
    throw new Error(`Unsupported ciphertext version: ${version ?? "(none)"}`);
  }
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

interface DecryptOptions {
  expectedPurpose: string;
}

/**
 * 暗号文を復号化。v2 の kid は primary key の kid と一致する必要がある。
 *
 * 呼び出し側は `expectedPurpose` を必ず渡し、暗号文の埋め込み purpose と一致することを
 * 復号前に検証する（defense in depth）。purpose 不一致は GCM authTag 検証よりも
 * 前に throw されるため、他用途トークンの流用は無駄な暗号処理なしに拒否される。
 */
export function decrypt(ciphertext: string, options: DecryptOptions): Buffer {
  const parsed = parseCiphertext(ciphertext);

  if (parsed.purpose !== options.expectedPurpose) {
    throw new Error(
      `Ciphertext purpose mismatch: expected "${options.expectedPurpose}", got "${parsed.purpose}"`,
    );
  }

  const key: EncryptionKey = getPrimaryEncryptionKey();

  if (parsed.kid !== key.kid) {
    throw new Error(
      `No primary encryption key available for kid="${parsed.kid}"`,
    );
  }

  const derivedKey = deriveKey(key.hex, parsed.purpose);
  const aad = Buffer.from(`${parsed.version}:${parsed.purpose}`, "utf8");

  const decipher = createDecipheriv(ALGORITHM, derivedKey, parsed.iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(parsed.authTag);

  return Buffer.concat([decipher.update(parsed.ct), decipher.final()]);
}

/**
 * 暗号化フォーマットかどうかを確認（v2 のみ）。
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
export function safeDecrypt(
  ciphertext: string,
  options: DecryptOptions,
): Buffer | null {
  try {
    return decrypt(ciphertext, options);
  } catch (error) {
    logError(error instanceof Error ? error : new Error("Decryption failed"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "safeDecrypt",
        expectedPurpose: options.expectedPurpose,
      },
    });
    return null;
  }
}
