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

export function runSetup(runner: CommandRunner = runInherited): number {
  const envState = ensureEnvLocal();
  // Existing .env.local is auto-loaded by Bun at process start; a file created
  // in this run was applied inside ensureEnvLocal().
  if (envState === "exists") {
    applyEnvFile(envLocalPath);
  }

  const steps: readonly (readonly [
    label: string,
    command: readonly string[],
    env?: Readonly<Record<string, string>>,
  ])[] = [
    [
      "Starting PostgreSQL (db + test-db)",
      [
        "docker",
        "compose",
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "60",
        "db",
        "test-db",
      ],
    ],
    ["Generating Prisma client", ["bun", "run", "db:generate"]],
    ["Applying migrations", ["bunx", "--bun", "prisma", "migrate", "deploy"]],
    [
      "Seeding database",
      ["bun", "run", "db:seed"],
      // `.env.local` には surface を選ぶために `APP_SURFACE` を入れるのが普通で、
      // その値は上の `applyEnvFile` でこのプロセスの env に載る。ところが seed の
      // 安全ガード（`prisma/seed-safety.ts` の secondary gate）は `APP_SURFACE` が
      // 立っていることを「デプロイされたプロセス」の印と見て `--dev` を拒否する。
      // 結果、**標準的な `.env.local` を持つ環境では `bun run setup` が必ず
      // seed で落ちる**（しかも seed は最終 step なので、そこまでの migrate は
      // 済んでいて「半分できた」状態が残る）。
      //
      // setup-local は定義上ローカル専用で、直前に localhost の Docker Postgres を
      // `--wait` 付きで起動している。この 1 呼び出しに限って印を外す。
      // **ガードを無効化するわけではない** — DATABASE_URL が本番に見えるなら
      // primary gate（`looksLikeProductionDatabaseUrl`）が依然として拒否する。
      { APP_SURFACE: "" },
    ],
  ];

  for (const [label, command, env] of steps) {
    console.info(`[setup] ${label}...`);
    const exitCode = runner(command, env);
    if (exitCode !== 0) {
      console.error(`[setup] Failed: ${label}`);
      return exitCode;
    }
  }

  console.info(
    "[setup] Local bootstrap complete. Run `bun run dev` to start the dev server.",
  );
  return 0;
}

if (import.meta.main) {
  process.exit(runSetup());
}
