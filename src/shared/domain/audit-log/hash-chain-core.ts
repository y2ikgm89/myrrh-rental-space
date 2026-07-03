import { createHmac } from "node:crypto";
import type { AuditAction } from "@generated/prisma/enums";
import { isRecord } from "@/shared/lib/serialize";

export const AUDIT_LOG_CHAIN_VERSION = 1;
export const AUDIT_LOG_HASH_ALGORITHM = "HMAC-SHA256";
export const AUDIT_LOG_GENESIS_HASH = "0".repeat(64);
export const AUDIT_LOG_CHAIN_LOCK_KEY = 6_029_451_381_908_262_157n;

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

export function computeAuditLogEntryHashWithKey(
  payload: AuditLogHashPayload,
  hmacKeyHex: string,
): string {
  return createHmac("sha256", Buffer.from(hmacKeyHex, "hex"))
    .update(canonicalAuditJson(payload), "utf8")
    .digest("hex");
}
