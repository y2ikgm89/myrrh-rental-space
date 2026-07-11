/**
 * Pure parser for the `SECONDARY_ENCRYPTION_KEYS` env value.
 *
 * Lives in its own file so `server.ts` (which owns the env schema) can invoke
 * it from `validateProductionEnv()` without importing `encryption.ts`, which
 * imports `serverEnv` back from `server.ts`. Any shared state or logic here
 * must stay dependency-free.
 *
 * Wire format:
 *
 *     "kid1:hex64,kid2:hex64"
 *
 * - Entries are comma-separated. Whitespace around each entry is trimmed.
 * - `kid` is 1-32 chars of `[a-zA-Z0-9_-]`.
 * - `hex` is exactly 64 lowercase-or-uppercase hex characters (32-byte key).
 * - Duplicate kids throw.
 * - Empty / undefined input returns `[]` (no rotation window open).
 */

export interface EncryptionKey {
  kid: string;
  hex: string;
}

export function parseSecondaryEncryptionKeys(
  raw: string | null | undefined,
): EncryptionKey[] {
  if (!raw) return [];

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return [];

  const seenKids = new Set<string>();
  const parsed: EncryptionKey[] = [];

  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator <= 0) {
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS entry "${entry}" must be "<kid>:<hex64>"`,
      );
    }
    const kid = entry.slice(0, separator);
    const hex = entry.slice(separator + 1);
    if (!/^[a-zA-Z0-9_-]{1,32}$/u.test(kid)) {
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS entry "${entry}" has invalid kid; must be 1-32 chars of [a-zA-Z0-9_-]`,
      );
    }
    if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/u.test(hex)) {
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS entry for kid="${kid}" must be exactly 64 hex characters`,
      );
    }
    if (seenKids.has(kid)) {
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS contains duplicate kid "${kid}"`,
      );
    }
    seenKids.add(kid);
    parsed.push({ kid, hex });
  }

  return parsed;
}
