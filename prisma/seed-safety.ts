/**
 * Seed CLI fail-closed safety (pure, no Prisma / server-only imports).
 *
 * **判定するのは接続先だけ。** `--dev` は localhost の DATABASE_URL にしか流さない。
 * `--production` が唯一の意図的な本番 bootstrap 経路で、`--reset` とは併用できない。
 *
 * ## プロセスの env で判定しない（2026-08-09 に廃止）
 *
 * かつては「`NODE_ENV=production` か `APP_SURFACE` が立っていたら、`E2E_RUNTIME=1` か
 * `CI=true` でない限り拒否する」という二段目のガードがあった。**これは構造的に
 * 何も守っていなかった。**
 *
 * `looksLikeProductionDatabaseUrl` の最終行が `!isLocalhostDatabaseUrl(...)` なので、
 * 一段目を通った時点で **localhost であることが既に保証されている**。二段目の
 * 「localhost かつ E2E/CI」という条件は前半が常に真で、実際には
 * 「E2E_RUNTIME か CI が無ければ拒否」だけが効いていた。localhost の DB に本番データは
 * 無いのだから、そこに守るものは無い。
 *
 * 一方で実害は確実にあった。`APP_SURFACE` は public / admin のどちらを見るかを決める
 * env で、ローカルの `.env.local` に置くのは正当な構成
 * （`.claude/rules/app-structure.md`）。`scripts/setup-local.ts` はその `.env.local` を
 * 自分のプロセス env に載せてから `db:seed` を呼ぶので、**`bun run setup` が最終 step で
 * 必ず落ちていた**（migrate まで済んだ「半分できた」状態が残る）。
 *
 * 守る対象が無く、正当な経路だけを止めるガードは残さない。多層防御にもならない
 * ——層が増えたのではなく、一段目の結論を言い換えただけだったため。
 */

export type SeedCliMode = "dev" | "production";

export type SeedSafetyEnv = {
  readonly databaseUrl: string | undefined;
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

  // `--reset` は廃止した（`bun run db:reset` = `prisma migrate reset --force`
  // + seed が同じことをより確実に行う）。筋肉記憶で打たれたときに黙って dev に
  // 落ちないよう、unknown option として明示的に落とす。
  //
  // 代替として案内する `db:reset` は **seed が起動する前に DB を落とす**ので、
  // このファイルのガードは間に合わない。`scripts/assert-destructive-db-target.ts`
  // を前段に置いて初めて等価な安全性になる（そちらは Prisma CLI と同じ順序で
  // `DIRECT_URL` → `DATABASE_URL` を解決する）。案内文と実体を乖離させないこと。
  if (hasFlag(argv, "--reset")) {
    return {
      ok: false,
      error:
        "Refusing seed: --reset は廃止しました。破壊的な作り直しは `bun run db:reset` を使ってください（前段の assert-destructive-db-target.ts が対象 DB を検証します）。",
    };
  }

  const mode = resolveMode(argv);
  if (mode === "unknown") {
    return {
      ok: false,
      error: `Unknown option: ${argv[0]}\nUsage: bun prisma/seed.ts [--dev | --production [email] [name]]`,
    };
  }

  if (mode === "production") {
    return { ok: true, mode };
  }

  const databaseUrl = env.databaseUrl?.trim();
  if (!databaseUrl) {
    return {
      ok: false,
      error: "Refusing seed --dev: DATABASE_URL is not set.",
    };
  }

  // 唯一の gate: `--dev` を本番に見える DATABASE_URL へ流さない。
  // `looksLikeProductionDatabaseUrl` は最終行が `!isLocalhostDatabaseUrl(...)` なので
  // **localhost 以外を全部拒否する allowlist**。前段の blocklist（`/cloudsql/` /
  // `.neon.tech` / prod marker）は「localhost に見えるが実は本番」（cloud-sql-proxy
  // 等）を捕まえる補強で、allowlist を置き換えるものではない。
  if (looksLikeProductionDatabaseUrl(databaseUrl)) {
    return {
      ok: false,
      error:
        "Refusing seed --dev/--reset: DATABASE_URL looks like a production database (Cloud SQL / Neon / non-localhost / prod marker). Point DATABASE_URL at localhost, or use --production for intentional prod bootstrap.",
    };
  }

  return { ok: true, mode };
}
