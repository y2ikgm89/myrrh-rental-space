/**
 * Names of the env vars `validateProductionEnv()` rejects outside the
 * localhost E2E runtime exception (see `.claude/rules/security-auth.md`).
 *
 * Kept in its own dependency-free file — not inside `server.ts` — so that
 * `__tests__/unit/lib/env/server-production-env.test.ts` can import just the
 * names to purge ambient values (e.g. from a developer's local `.env`) before
 * building a known-good production env, without triggering `server.ts`'s
 * module-level `createEnv()` evaluation.
 */
export const UNSAFE_E2E_ONLY_ENV_KEYS = [
  "NEXT_PUBLIC_ENABLE_E2E_LOGIN",
  "E2E_RUNTIME",
  "ADMIN_TEST_IAP_EMAIL",
] as const;
