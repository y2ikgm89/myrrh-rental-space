/**
 * Seed CLI fail-closed safety (pure, no Prisma / server-only imports).
 *
 * `--dev` (default) and `--reset` must never run against a production-looking
 * DATABASE_URL or inside a deployed runtime (NODE_ENV=production / APP_SURFACE).
 * `--production` is the only intentional prod bootstrap path and cannot combine
 * with `--reset`.
 */

export type SeedCliMode = "dev" | "reset" | "production";

export type SeedSafetyEnv = {
  readonly databaseUrl: string | undefined;
  readonly nodeEnv: string | undefined;
  readonly appSurface: string | undefined;
  /**
   * Playwright webServer / local E2E sets `E2E_RUNTIME=1` with localhost DB.
   * Deployed Cloud Run never sets this (and must not).
   */
  readonly e2eRuntime: string | undefined;
  /** GitHub Actions / CI runners (`CI=true`). */
  readonly ci: string | undefined;
};

export type SeedSafetyResult =
  | { readonly ok: true; readonly mode: SeedCliMode }
  | { readonly ok: false; readonly error: string };

/** Aligns with `isLocalhostDatabaseUrl` in `src/shared/lib/env/server.ts`. */
export function isLocalhostDatabaseUrl(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Positive production markers for DATABASE_URL (fail-closed for --dev/--reset).
 * Covers Neon, Cloud SQL sockets/hosts, and obvious prod hostname/db segments.
 */
export function looksLikeProductionDatabaseUrl(databaseUrl: string): boolean {
  const trimmed = databaseUrl.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (lower.includes("/cloudsql/")) return true;
  if (lower.includes("cloudsql")) return true;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (hostname.endsWith(".neon.tech")) return true;
    if (hostname.endsWith(".sql.goog")) return true;
    if (hostname.includes("cloudsql")) return true;

    const haystack = `${hostname}${url.pathname}`.toLowerCase();
    if (/(?:^|[./_-])prod(?:uction)?(?:$|[./_-])/u.test(haystack)) {
      return true;
    }
  } catch {
    // Unparseable connection strings are treated as unsafe.
    return true;
  }

  return !isLocalhostDatabaseUrl(trimmed);
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function resolveMode(argv: readonly string[]): SeedCliMode | "unknown" {
  const mode = argv[0];
  if (!mode || mode === "--dev") return "dev";
  if (mode === "--reset") return "reset";
  if (mode === "--production") return "production";
  return "unknown";
}

/**
 * Evaluate whether the seed CLI may proceed. Side-effect free.
 */
export function evaluateSeedSafety(input: {
  readonly argv: readonly string[];
  readonly env: SeedSafetyEnv;
}): SeedSafetyResult {
  const { argv, env } = input;

  if (hasFlag(argv, "--reset") && hasFlag(argv, "--production")) {
    return {
      ok: false,
      error:
        "Refusing seed: --production cannot be combined with --reset. Reset is forever forbidden against production bootstrap.",
    };
  }

  const mode = resolveMode(argv);
  if (mode === "unknown") {
    return {
      ok: false,
      error: `Unknown option: ${argv[0]}\nUsage: bun prisma/seed.ts [--dev | --reset | --production [email] [name]]`,
    };
  }

  if (mode === "production") {
    return { ok: true, mode };
  }

  const databaseUrl = env.databaseUrl?.trim();
  if (!databaseUrl) {
    return {
      ok: false,
      error: "Refusing seed --dev/--reset: DATABASE_URL is not set.",
    };
  }

  // Primary gate: never --dev/--reset against prod-looking DATABASE_URL
  // (including cloud-sql-proxy on loopback via /cloudsql/ query + prod markers).
  if (looksLikeProductionDatabaseUrl(databaseUrl)) {
    return {
      ok: false,
      error:
        "Refusing seed --dev/--reset: DATABASE_URL looks like a production database (Cloud SQL / Neon / non-localhost / prod marker). Point DATABASE_URL at localhost, or use --production for intentional prod bootstrap.",
    };
  }

  // Secondary gate: APP_SURFACE / NODE_ENV=production usually mean a deployed
  // process. Allow only when DB is loopback AND (E2E_RUNTIME=1 or CI=true),
  // which is how Playwright smoke / GitHub Actions seed local Postgres while
  // setting APP_SURFACE=public|admin. Cloud Run never sets E2E_RUNTIME.
  const deployedRuntimeMarker =
    env.nodeEnv === "production" || Boolean(env.appSurface?.trim());
  if (deployedRuntimeMarker) {
    const localE2eOrCi =
      isLocalhostDatabaseUrl(databaseUrl) &&
      (env.e2eRuntime === "1" || env.ci === "true");
    if (!localE2eOrCi) {
      return {
        ok: false,
        error:
          "Refusing seed --dev/--reset: NODE_ENV=production or APP_SURFACE is set outside local E2E/CI. Use --production for intentional prod bootstrap, or unset those env vars for local/dev (or set E2E_RUNTIME=1 against localhost).",
      };
    }
  }

  return { ok: true, mode };
}
