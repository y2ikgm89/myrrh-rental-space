import { createHash, createHmac } from "node:crypto";
import { serverEnv } from "@/shared/lib/env/server";

/**
 * Suppression 判定用の recipient hash（`getSuppressedEmailSet` の値と `.has()` 比較）。
 * domain / lib 双方から参照するため lib に置く（Prisma 非依存）。
 */
export function hashSuppressedEmailCandidate(canonicalEmail: string): string {
  const secret = serverEnv.SUPPRESSION_HASH_SECRET;
  if (secret && secret.length > 0) {
    return createHmac("sha256", secret).update(canonicalEmail).digest("hex");
  }
  return createHash("sha256").update(canonicalEmail).digest("hex");
}
