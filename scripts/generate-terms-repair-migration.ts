#!/usr/bin/env bun
/**
 * terms contentJson 修復 migration 生成の thin wrapper。
 * Lexical import は bun test + JSDOM preload コンテキストが必要なため subprocess 経由。
 *
 * Usage:
 *   bun scripts/generate-terms-repair-migration.ts [--apply-local]
 */

import { spawnSync } from "node:child_process";

const applyLocal = process.argv.includes("--apply-local");

const env = {
  ...process.env,
  REPAIR_DATABASE_URL: process.env["DATABASE_URL"],
  GENERATE_TERMS_REPAIR: "1",
  ...(applyLocal ? { APPLY_LOCAL: "1" } : {}),
};

const result = spawnSync(
  "bun",
  [
    "scripts/run-tests.ts",
    "./__tests__/tools/repair-terms-content-worker.test.ts",
  ],
  {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
