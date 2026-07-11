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
 *
 * ## Secret hygiene
 *
 * Error messages MUST NOT include the raw entry contents. `validateProductionEnv()`
 * runs at `instrumentation.register()` time and any Error thrown here lands in
 * Cloud Run stdout — with the entry included, an operator who accidentally sets
 * `SECONDARY_ENCRYPTION_KEYS` to just the 64-hex value (no `<kid>:` prefix)
 * would leak raw key material into the log stream. Error messages therefore
 * only surface: entry index (1-based), the kid if we successfully split one out,
 * and the length of the offending fragment. That is enough for the operator to
 * find and fix the malformed entry without exposing bytes to log viewers.
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

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry === undefined) continue; // unreachable — filter above kept only non-empty strings
    const position = index + 1; // 1-based for humans
    const separator = entry.indexOf(":");
    if (separator <= 0) {
      // Do NOT echo `entry` — an operator who pasted a raw 64-hex value here
      // would leak that key material to Cloud Run logs on startup failure.
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS entry #${position} (length=${entry.length}) must be "<kid>:<hex64>"; no colon separator found`,
      );
    }
    const kid = entry.slice(0, separator);
    const hex = entry.slice(separator + 1);
    if (!/^[a-zA-Z0-9_-]{1,32}$/u.test(kid)) {
      // Report only kid length; some chars in the kid segment may themselves
      // be sensitive if the operator scrambled the value.
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS entry #${position} has invalid kid (length=${kid.length}); must be 1-32 chars of [a-zA-Z0-9_-]`,
      );
    }
    if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/u.test(hex)) {
      // kid passed the regex above so it is safe to include verbatim. Do NOT
      // include the hex fragment even prefixed / truncated — the invariant is
      // that no candidate key material touches the log stream.
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS entry #${position} for kid="${kid}" must be exactly 64 hex characters (got length=${hex.length})`,
      );
    }
    if (seenKids.has(kid)) {
      throw new Error(
        `SECONDARY_ENCRYPTION_KEYS entry #${position} contains duplicate kid "${kid}"`,
      );
    }
    seenKids.add(kid);
    parsed.push({ kid, hex });
  }

  return parsed;
}
