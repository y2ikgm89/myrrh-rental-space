import "server-only";

import { createHmac } from "node:crypto";
import type { AuditAction } from "@generated/prisma/enums";
import { serverEnv } from "@/shared/lib/env/server";
import { isRecord } from "@/shared/lib/serialize";

export const AUDIT_LOG_CHAIN_VERSION = 1;
export const AUDIT_LOG_HASH_ALGORITHM = "HMAC-SHA256";
export const AUDIT_LOG_GENESIS_HASH = "0".repeat(64);
export const AUDIT_LOG_CHAIN_LOCK_KEY = 6_029_451_381_908_262_157n;

const AUDIT_LOG_HASH_KEY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/u;
const LOCAL_DEV_AUDIT_LOG_HMAC_KEY = "f".repeat(64);

export type AuditLogHashPayload = {
  version: number;
  id: string;
  sequence: string;
  previousHash: string;
  hashAlgorithm: string;
  hashKeyId: string;
  userId: string | null;
  action: AuditAction;
  resource: string;
  resourceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: string;
};

function canonicalizeAuditHashValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeAuditHashValue(item));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalizeAuditHashValue(value[key]);
    }
    return result;
  }
  return value;
}

export function canonicalAuditJson(value: unknown): string {
  return JSON.stringify(canonicalizeAuditHashValue(value));
}

export function getAuditLogHashKeyId(): string {
  const keyId = serverEnv.AUDIT_LOG_HMAC_KEY_ID ?? "v1";
  if (!AUDIT_LOG_HASH_KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      "AUDIT_LOG_HMAC_KEY_ID must be 1-32 chars of [a-zA-Z0-9_-]",
    );
  }
  return keyId;
}

function getAuditLogHmacKeyHex(): string {
  const configuredKey = serverEnv.AUDIT_LOG_HMAC_KEY;
  if (configuredKey) return configuredKey;

  if (serverEnv.NODE_ENV === "production") {
    throw new Error("AUDIT_LOG_HMAC_KEY is required in production");
  }

  return LOCAL_DEV_AUDIT_LOG_HMAC_KEY;
}

function getAuditLogHmacKeyHexForKeyId(keyId: string): string {
  if (keyId === getAuditLogHashKeyId()) {
    return getAuditLogHmacKeyHex();
  }

  throw new Error(
    `AUDIT_LOG_HMAC key id "${keyId}" does not match the current configured key id`,
  );
}

export function computeAuditLogEntryHash(payload: AuditLogHashPayload): string {
  return createHmac(
    "sha256",
    Buffer.from(getAuditLogHmacKeyHexForKeyId(payload.hashKeyId), "hex"),
  )
    .update(canonicalAuditJson(payload), "utf8")
    .digest("hex");
}
