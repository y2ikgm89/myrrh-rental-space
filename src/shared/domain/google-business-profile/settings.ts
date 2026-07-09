/**
 * Settings シングルトンに保存された Google Business Profile 認証情報の暗号化 I/O。
 *
 * - `googleBusinessProfileAuth` は `Json?` 型で `{ encrypted: string }` 形式を保存
 * - 中身は `JSON.stringify(GbpAuthState)` を
 *   `encrypt(..., { purpose: "google-business-profile-auth" })` で暗号化
 * - `googleBusinessProfileEnabled` が false または auth が null の場合は `getGbpAuthState()` が null を返す
 */

import "server-only";

import { Prisma } from "@generated/prisma/client";

import { prisma } from "@/shared/db/prisma";
import { decrypt, encrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { isRecord } from "@/shared/lib/serialize";

import type { GbpAuthState } from "@/shared/lib/google-business-profile/types";

const GBP_AUTH_PURPOSE = SETTINGS_CRYPTO_PURPOSES.googleBusinessProfileAuth;

/**
 * 暗号化した GbpAuthState を `{ encrypted: string }` 形式で Prisma Json に格納するための型。
 */
type EncryptedAuthEnvelope = { readonly encrypted: string };

function isEncryptedEnvelope(value: unknown): value is EncryptedAuthEnvelope {
  return isRecord(value) && typeof value["encrypted"] === "string";
}

function isGbpAuthState(value: unknown): value is GbpAuthState {
  if (!isRecord(value)) return false;
  return (
    typeof value["accessToken"] === "string" &&
    typeof value["refreshToken"] === "string" &&
    typeof value["expiresAt"] === "number" &&
    typeof value["accountId"] === "string" &&
    typeof value["accountName"] === "string"
  );
}

/**
 * Settings シングルトンを保証する upsert helper。
 * `id` カラムは `@default("singleton")` のため、シンプルに `id: "singleton"` を使う。
 */
async function ensureSettingsId(): Promise<string> {
  const settings = await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
    select: { id: true },
  });
  return settings.id;
}

/**
 * Settings から GBP 認証情報を復号して取得する。
 *
 * - `googleBusinessProfileEnabled === false` → null
 * - `googleBusinessProfileAuth` が null / 不正形式 → null
 * - decrypt / parse 失敗 → `logError`（HIGH）+ null（次回連携で復旧可能）
 */
export async function getGbpAuthState(): Promise<GbpAuthState | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleBusinessProfileEnabled: true,
      googleBusinessProfileAuth: true,
    },
  });

  if (!settings) return null;
  if (!settings.googleBusinessProfileEnabled) return null;

  const envelope = settings.googleBusinessProfileAuth;
  if (!isEncryptedEnvelope(envelope)) return null;

  try {
    const plaintext = decrypt(envelope.encrypted);
    const parsed: unknown = JSON.parse(plaintext);
    if (!isGbpAuthState(parsed)) {
      throw new Error("Invalid GbpAuthState shape");
    }
    return parsed;
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getGbpAuthState" },
    });
    return null;
  }
}

/**
 * GBP 認証情報を暗号化して Settings に保存する。
 *
 * `googleBusinessProfileEnabled` を true にし、再連携時の reset を兼ねる。
 */
export async function saveGbpAuthState(state: GbpAuthState): Promise<void> {
  const id = await ensureSettingsId();
  const encrypted = encrypt(JSON.stringify(state), {
    purpose: GBP_AUTH_PURPOSE,
  });

  await prisma.settings.update({
    where: { id },
    data: {
      googleBusinessProfileAuth: { encrypted },
      googleBusinessProfileEnabled: true,
    },
  });
}

/**
 * GBP 認証情報を Settings から削除する。
 *
 * `googleBusinessProfileEnabled` も false に戻す。
 */
export async function clearGbpAuthState(): Promise<void> {
  const id = await ensureSettingsId();
  await prisma.settings.update({
    where: { id },
    data: {
      googleBusinessProfileAuth: Prisma.JsonNull,
      googleBusinessProfileEnabled: false,
    },
  });
}
