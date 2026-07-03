import "server-only";

import { serverEnv } from "@/shared/lib/env/server";
import {
  computeAuditLogEntryHashWithKey,
  type AuditLogHashPayload,
} from "./hash-chain-core";
export {
  AUDIT_LOG_CHAIN_LOCK_KEY,
  AUDIT_LOG_CHAIN_VERSION,
  AUDIT_LOG_GENESIS_HASH,
  AUDIT_LOG_HASH_ALGORITHM,
  canonicalAuditJson,
  type AuditLogHashPayload,
} from "./hash-chain-core";

const AUDIT_LOG_HASH_KEY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/u;
const LOCAL_DEV_AUDIT_LOG_HMAC_KEY = "f".repeat(64);

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
  return computeAuditLogEntryHashWithKey(
    payload,
    getAuditLogHmacKeyHexForKeyId(payload.hashKeyId),
  );
}
