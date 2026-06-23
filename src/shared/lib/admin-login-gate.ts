/**
 * Admin Login Gate
 *
 * 管理画面ログインページを非公開にするための署名付きトークンシステム。
 * トークンなしでは /admin/login が 404 を返す。
 *
 * - HMAC-SHA256 署名付きワンタイムトークン
 * - proxy.ts・seed.ts・CLI スクリプトから直接呼び出し可能
 * - server-only / serverEnv に依存しない（process.env 直接参照）
 * - Cookie 設定もこのモジュールに統合
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();

export const ADMIN_GATE_COOKIE_NAME = "admin-gate";
// 8 hour: 当日受付運用 (5-6h 想定) 中の gate 切れによる /admin/login 404 復旧を防ぐ。
// path=/admin・HttpOnly・SameSite=strict・Secure は据置のため漏出面は変わらない。
export const ADMIN_GATE_COOKIE_MAX_AGE = 60 * 60 * 8;

export function getAdminGateCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict";
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "strict",
    maxAge: ADMIN_GATE_COOKIE_MAX_AGE,
    path: "/admin",
  };
}

// ---------------------------------------------------------------------------
// Signing key
// ---------------------------------------------------------------------------

function getSigningSecret(): string {
  const token = process.env["ADMIN_LOGIN_TOKEN"];
  if (token) return token;

  if (process.env["NODE_ENV"] !== "production") {
    return "dev-token-for-local-development-only";
  }

  throw new Error("ADMIN_LOGIN_TOKEN is required in production");
}

async function importSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ---------------------------------------------------------------------------
// Base64URL helpers
// ---------------------------------------------------------------------------

function toBase64Url(value: string | Uint8Array): string {
  if (typeof value === "string") {
    return Buffer.from(value, "utf8").toString("base64url");
  }
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function fromBase64UrlBytes(value: string): Uint8Array | null {
  try {
    return new Uint8Array(Buffer.from(value, "base64url"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

interface ParsedToken {
  readonly expiresAtMs: number;
  readonly payload: string;
  readonly signature: Uint8Array;
}

function parseSignedToken(token: string): ParsedToken | null {
  if (!TOKEN_PATTERN.test(token)) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) return null;

  const payload = fromBase64Url(encodedPayload);
  const signature = fromBase64UrlBytes(encodedSignature);
  if (!payload || !signature) return null;

  const payloadParts = payload.split(".");
  if (payloadParts.length !== 2) return null;

  const [expiresAtRaw, nonce] = payloadParts;
  if (!expiresAtRaw || !nonce) return null;

  const expiresAtMs = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return null;

  return { expiresAtMs, payload, signature };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** トークン形式の簡易チェック（署名検証なし） */
export function isSignedAdminGateToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** HMAC-SHA256 署名付きトークンを生成 */
export async function createAdminGateToken(options?: {
  readonly nowMs?: number;
  readonly ttlMs?: number;
  readonly nonce?: string;
}): Promise<{ readonly token: string; readonly expiresAt: Date }> {
  const nowMs = options?.nowMs ?? Date.now();
  const ttlMs = options?.ttlMs ?? TOKEN_TTL_MS;
  const expiresAtMs = nowMs + ttlMs;
  const payload = `${expiresAtMs}.${options?.nonce ?? crypto.randomUUID()}`;
  const signingKey = await importSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    textEncoder.encode(payload),
  );

  return {
    token: `${toBase64Url(payload)}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAt: new Date(expiresAtMs),
  };
}

/** トークンの署名と有効期限を検証 */
export async function verifyAdminGateToken(
  token: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const parsed = parseSignedToken(token);
  if (!parsed || parsed.expiresAtMs < nowMs) return false;

  const signingKey = await importSigningKey();
  return crypto.subtle.verify(
    "HMAC",
    signingKey,
    Buffer.from(parsed.signature),
    textEncoder.encode(parsed.payload),
  );
}
