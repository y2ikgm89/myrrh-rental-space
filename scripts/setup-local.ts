#!/usr/bin/env bun
/**
 * Non-interactive local bootstrap: env file, Docker Postgres, Prisma migrate + seed.
 *
 * Bun auto-loads `.env.local` only at process start. If this script creates
 * `.env.local`, values are applied to `process.env` before child processes run.
 */

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envExamplePath = join(root, ".env.example");
const envLocalPath = join(root, ".env.local");

type CommandRunner = (
  command: readonly string[],
  env?: Readonly<Record<string, string>>,
) => number;

function applyEnvFile(path: string): void {
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Z_][A-Z0-9_]*)="([^"]*)"/u.exec(trimmed);
    if (!match) continue;

    const [, key, value] = match;
    if (key) {
      process.env[key] = value;
    }
  }
}

export function ensureEnvLocal(): "created" | "exists" {
  if (existsSync(envLocalPath)) {
    console.info("[setup] .env.local already exists — skipping copy");
    return "exists";
  }

  copyFileSync(envExamplePath, envLocalPath);
  console.info("[setup] Created .env.local from .env.example");
  applyEnvFile(envLocalPath);
  return "created";
}

function runInherited(
  command: readonly string[],
  env?: Readonly<Record<string, string>>,
): number {
  const proc = Bun.spawnSync([...command], {
    stdout: "inherit",
    stderr: "inherit",
    env: env ? { ...process.env, ...env } : process.env,
  });
  return proc.exitCode;
}

/** コマンドの stdout を取る（失敗したら null）。 */
export type CommandCapture = (command: readonly string[]) => string | null;

function captureInherited(command: readonly string[]): string | null {
  const proc = Bun.spawnSync([...command], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  if (proc.exitCode !== 0) return null;
  return new TextDecoder().decode(proc.stdout).trim();
}

export interface ComposeDatabaseTarget {
  readonly port: string;
  readonly database: string;
}

/**
 * この setup が起動したコンテナの接続先を **compose に訊いて**取る。
 *
 * 値をここに書き写すと `docker-compose.yml` と二重管理になり、片方だけ動いたときに
 * 気づけない。port と database 名は compose 自身に答えさせる。
 */
export function resolveComposeDatabaseTarget(
  capture: CommandCapture,
): ComposeDatabaseTarget | null {
  // `docker compose port db 5432` → "0.0.0.0:5432"
  const mapped = capture(["docker", "compose", "port", "db", "5432"]);
  const port = mapped?.split(":").at(-1)?.trim();
  const database = capture([
    "docker",
    "compose",
    "exec",
    "-T",
    "db",
    "printenv",
    "POSTGRES_DB",
  ])?.trim();
  if (!port || !database) return null;
  return { port, database };
}

/**
 * `DATABASE_URL` が **この setup が起動した Docker Postgres** を指しているか。
 *
 * seed の deployed-runtime ガード（`prisma/seed-safety.ts`）を外す前に必ず通す。
 * ガードは `APP_SURFACE` の有無で「デプロイされたプロセス」を推定するが、それは
 * **loopback トンネル / プロキシ越しの本番 DB を止める最後の砦**でもある。
 *
 * 実測: `postgresql://user:pass@localhost:55432/neondb` は host が loopback で
 * path に prod marker が無いため、`looksLikeProductionDatabaseUrl` が **false** を返して
 * 一段目を素通りする。つまり **「loopback だから安全」は成り立たない**。
 * port と database 名まで一致して初めて、印を外してよい相手だと言える。
 */
export function targetsSetupManagedDatabase(
  databaseUrl: string | undefined,
  target: ComposeDatabaseTarget | null,
  // `undefined` では必ず false を返すので、通った側は string だと言い切れる。
  // 呼び出し側はこの値を migrate / seed の `DATABASE_URL` / `DIRECT_URL` に固定する。
): databaseUrl is string {
  if (!databaseUrl || !target) return false;
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname.toLowerCase();
    const isLoopback =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]";
    if (!isLoopback) return false;

    const port = url.port === "" ? "5432" : url.port;
    const database = url.pathname.replace(/^\//u, "");
    return port === target.port && database === target.database;
  } catch {
    return false;
  }
}

/**
 * 依存はすべて**必須引数**で受ける。既定値を置くと「実走査だけが通る配線」ができ、
 * テストがその経路を一度も踏まなくなる。
 */
export function runSetup(
  runner: CommandRunner,
  capture: CommandCapture,
  readDatabaseUrl: () => string | undefined,
): number {
  console.info("[setup] Starting PostgreSQL (db + test-db)...");
  const composeExitCode = runner([
    "docker",
    "compose",
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "60",
    "db",
    "test-db",
  ]);
  if (composeExitCode !== 0) {
    console.error("[setup] Failed: Starting PostgreSQL (db + test-db)");
    return composeExitCode;
  }

  // **接続先の確定は DB を触る前**（migrate も seed も、この後ろ）。
  //
  // 旧実装はこの判定を seed の直前だけに置いていた（監査 F-23）。`migrate deploy` は
  // その手前で `process.env` をそのまま引き継いで起動しており、`.env.local` に本番の
  // `DIRECT_URL` が残っている開発者が `bun run setup` を叩くと、
  // `prisma.config.ts` の `resolvePrismaCliDatasourceUrl()` が `DIRECT_URL` を最優先で
  // 返すため、**リポジトリの pending migration が全件そのまま本番へ入る**。
  //
  // 本番の migrate は Cloud Run migrator Job だけが実行し、その CMD は
  // `bun scripts/migration-preconditions.ts &&` でリハーサルと履歴照合を先に通す。
  // 破壊的 DDL のときは deploy 側が両サービスを scaling=0 にしてから流す。setup 経路は
  // そのどちらも通らないので、DROP COLUMN が計画ダウンタイム無しで本番に入り、
  // 旧 revision が壊れたスキーマを叩いて 500 になる。しかも seed 側の照合は
  // その後にしか走らないので、止められるのは seed だけで migration は適用済みだった。
  const target = resolveComposeDatabaseTarget(capture);
  // `.env.local` を env に載せた**後**に読む（`ensureEnvLocal` / `applyEnvFile` の後）。
  // 値を引数で受け取ると、この順序が呼び出し側の都合で崩れる。
  const databaseUrl = readDatabaseUrl();
  if (!targetsSetupManagedDatabase(databaseUrl, target)) {
    console.error("[setup] Failed: Resolving database target");
    console.error(
      "[setup] DATABASE_URL が、この setup で起動した Docker Postgres を指していません。",
    );
    console.error(
      `[setup]   期待: localhost:${target?.port ?? "<compose の port>"}/${target?.database ?? "<compose の POSTGRES_DB>"}`,
    );
    console.error(
      "[setup] setup は migrate と seed でローカル開発 DB を作り直します。別の DB（トンネル / プロキシ越しの本番を含む）を指したままでは実行しません。",
    );
    return 1;
  }

  // ここに来た時点で `databaseUrl` は compose の DB だと確かめ済み。
  // **Prisma CLI は `DIRECT_URL` を最優先で見る**ので、`DATABASE_URL` だけ正しくても
  // 足りない。両方を確定済みの値に固定して spawn する
  // （`scripts/migrate-test-db.ts` の `createPrismaMigrateEnv` と同じ方針）。
  const pinnedDatabaseEnv = {
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  } as const;

  const steps: readonly (readonly [
    label: string,
    command: readonly string[],
  ])[] = [
    ["Generating Prisma client", ["bun", "run", "db:generate"]],
    ["Applying migrations", ["bunx", "--bun", "prisma", "migrate", "deploy"]],
  ];

  for (const [label, command] of steps) {
    console.info(`[setup] ${label}...`);
    const exitCode = runner(command, pinnedDatabaseEnv);
    if (exitCode !== 0) {
      console.error(`[setup] Failed: ${label}`);
      return exitCode;
    }
  }

  // seed には接続先の固定に加えて、もう 1 つ外すものがある。
  //
  // `.env.local` には surface を選ぶために `APP_SURFACE` を入れるのが普通で、その値は
  // 上の `applyEnvFile` でこのプロセスの env に載る。seed の安全ガード
  // （`prisma/seed-safety.ts`）はそれを「デプロイされたプロセス」の印と見て `--dev` を
  // 拒否するため、外さないと `bun run setup` が最終 step で必ず落ちる。
  //
  // だが**無条件に外してはいけない**。その印は
  // **loopback トンネル / プロキシ越しの本番 DB を止める最後の砦**でもある
  // （`postgresql://user:pass@localhost:55432/neondb` は host が loopback で path に
  //  prod marker が無く、`looksLikeProductionDatabaseUrl` を素通りする＝実測済み）。
  // 外してよいのは、**この setup が起動したコンテナ**を指していると確かめた時だけ。
  console.info("[setup] Seeding database...");
  const seedExitCode = runner(["bun", "run", "db:seed"], {
    ...pinnedDatabaseEnv,
    APP_SURFACE: "",
  });
  if (seedExitCode !== 0) {
    console.error("[setup] Failed: Seeding database");
    return seedExitCode;
  }

  console.info(
    "[setup] Local bootstrap complete. Run `bun run dev` to start the dev server.",
  );
  return 0;
}

if (import.meta.main) {
  // env ファイルの用意は `runSetup` の外でやる。中に置くと、step の配線を
  // テストするだけで `.env.local` を作る / 読む副作用が付いてくる。
  const envState = ensureEnvLocal();
  // Existing .env.local is auto-loaded by Bun at process start; a file created
  // in this run was applied inside ensureEnvLocal().
  if (envState === "exists") {
    applyEnvFile(envLocalPath);
  }

  process.exit(
    runSetup(runInherited, captureInherited, () => process.env["DATABASE_URL"]),
  );
}
