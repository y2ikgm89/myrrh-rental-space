import "server-only";

import { serverEnv } from "@/shared/lib/env/server";
import {
  ADMIN_GATE_COOKIE_NAME,
  getAdminGateCookieOptions,
} from "@/shared/lib/admin-login-gate-cookie";

const ADMIN_GATE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_GATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();

function encodeBase64Url(value: string | Uint8Array): string {
  if (typeof value === "string") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function decodeBase64UrlBytes(value: string): Uint8Array | null {
  try {
    return new Uint8Array(Buffer.from(value, "base64url"));
  } catch {
    return null;
  }
}

export function getAdminLoginToken(): string {
  const token = serverEnv.ADMIN_LOGIN_TOKEN;
  if (token) {
    return token;
  }

  if (serverEnv.NODE_ENV !== "production") {
    return "dev-token-for-local-development-only";
  }

  throw new Error("ADMIN_LOGIN_TOKEN is required in production");
}

async function importSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getAdminLoginToken()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function parseSignedToken(
  token: string,
): {
  readonly expiresAtMs: number;
  readonly payload: string;
  readonly signature: Uint8Array;
} | null {
  if (!ADMIN_GATE_TOKEN_PATTERN.test(token)) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const payload = decodeBase64Url(encodedPayload);
  const signature = decodeBase64UrlBytes(encodedSignature);
  if (!payload || !signature) {
    return null;
  }

  const payloadParts = payload.split(".");
  if (payloadParts.length !== 2) {
    return null;
  }

  const [expiresAtRaw, nonce] = payloadParts;
  if (!expiresAtRaw || !nonce) {
    return null;
  }

  const expiresAtMs = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return null;
  }

  return {
    expiresAtMs,
    payload,
    signature,
  };
}

export async function createAdminGateToken(options?: {
  readonly nowMs?: number;
  readonly ttlMs?: number;
  readonly nonce?: string;
}): Promise<{ readonly token: string; readonly expiresAt: Date }> {
  const nowMs = options?.nowMs ?? Date.now();
  const ttlMs = options?.ttlMs ?? ADMIN_GATE_TOKEN_TTL_MS;
  const expiresAtMs = nowMs + ttlMs;
  const payload = `${expiresAtMs}.${options?.nonce ?? crypto.randomUUID()}`;
  const signingKey = await importSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    textEncoder.encode(payload),
  );

  return {
    token: `${encodeBase64Url(payload)}.${encodeBase64Url(new Uint8Array(signature))}`,
    expiresAt: new Date(expiresAtMs),
  };
}

export async function verifyAdminGateToken(
  token: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const parsed = parseSignedToken(token);
  if (!parsed || parsed.expiresAtMs < nowMs) {
    return false;
  }

  const signingKey = await importSigningKey();
  return crypto.subtle.verify(
    "HMAC",
    signingKey,
    Buffer.from(parsed.signature),
    textEncoder.encode(parsed.payload),
  );
}

export function isSignedAdminGateToken(token: string): boolean {
  return ADMIN_GATE_TOKEN_PATTERN.test(token);
}

export { ADMIN_GATE_COOKIE_NAME, getAdminGateCookieOptions };
