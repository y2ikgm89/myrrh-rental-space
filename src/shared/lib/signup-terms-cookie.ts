import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signup terms agreement cookie
 *
 * 公開ログインページで規約同意を集めて OAuth callback まで保持する。
 * 改ざん防止のため `BETTER_AUTH_SECRET` で HMAC-SHA256 署名する。
 *
 * Cookie 値形式: `<base64url(JSON.stringify({termsIds, exp}))>.<hex(hmac-sha256)>`
 */

export const SIGNUP_TERMS_COOKIE_NAME = "signup_terms_agreement";
export const SIGNUP_TERMS_COOKIE_MAX_AGE_SECONDS = 60 * 30; // 30 分

interface SignupTermsCookiePayload {
  readonly termsIds: readonly string[];
  /** Unix epoch (秒)。 */
  readonly exp: number;
}

function getSecret(): string {
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET is not configured for signup terms cookie",
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function encodeSignupTermsCookie(termsIds: readonly string[]): string {
  const payload: SignupTermsCookiePayload = {
    termsIds: [...termsIds],
    exp: Math.floor(Date.now() / 1000) + SIGNUP_TERMS_COOKIE_MAX_AGE_SECONDS,
  };
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(Buffer.from(json, "utf-8"));
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

export function decodeSignupTermsCookie(value: string): readonly string[] {
  const parts = value.split(".");
  if (parts.length !== 2) return [];
  const [encoded, sig] = parts;
  if (!encoded || !sig) return [];

  const expected = sign(encoded);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return [];
  if (!timingSafeEqual(sigBuf, expectedBuf)) return [];

  let payload: SignupTermsCookiePayload;
  try {
    const json = base64UrlDecode(encoded).toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("termsIds" in parsed) ||
      !("exp" in parsed) ||
      !Array.isArray((parsed as SignupTermsCookiePayload).termsIds) ||
      typeof (parsed as SignupTermsCookiePayload).exp !== "number"
    ) {
      return [];
    }
    payload = parsed as SignupTermsCookiePayload;
  } catch {
    return [];
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) return [];

  // 形式チェック: UUID 文字列のみ許容
  return payload.termsIds.filter(
    (id): id is string =>
      typeof id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        id,
      ),
  );
}
