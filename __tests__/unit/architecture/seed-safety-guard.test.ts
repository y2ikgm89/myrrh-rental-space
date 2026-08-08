import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = process.cwd();

describe("seed production DATABASE_URL fail-closed guard", () => {
  test("seed.ts evaluates seed-safety before any mode branch / DB writes", () => {
    const seed = readFileSync(join(root, "prisma", "seed.ts"), "utf8");
    const safety = readFileSync(join(root, "prisma", "seed-safety.ts"), "utf8");

    expect(seed).toContain('from "./seed-safety"');
    expect(seed).toContain("evaluateSeedSafety");
    expect(seed.indexOf("evaluateSeedSafety")).toBeLessThan(
      seed.indexOf("switch (safety.mode)"),
    );

    expect(safety).toContain("looksLikeProductionDatabaseUrl");
    expect(safety).toContain("isLocalhostDatabaseUrl");
    expect(safety).toContain("/cloudsql/");
    expect(safety).toContain(".neon.tech");

    // **判定材料は接続先だけ**であることを、型定義そのもので固定する。
    //
    // ここに `toContain("APP_SURFACE")` と書いてはいけない。ソース文字列の検査は
    // **docstring やコメントでも通る**ので、実装が何を見ているかを何も保証しない
    // （実際 2026-08-09 まで `NODE_ENV` / `APP_SURFACE` の toContain があり、
    //  二段目のガードを消しても解説文だけで緑になる状態だった）。
    //
    // プロセスの env を判定に戻すと、`.env.local` に `APP_SURFACE` を置いた環境で
    // `bun run setup` が最終 step の seed に届かなくなる。型で塞ぐ。
    expect(safety).toMatch(
      /export type SeedSafetyEnv = \{\s*readonly databaseUrl: string \| undefined;\s*\};/u,
    );
    // `--reset` は廃止済み。黙って dev に落ちず明示的に拒否することを固定する
    // （筋肉記憶で打たれた破壊フラグが dev seed として通ると最悪）。
    expect(safety).toContain('hasFlag(argv, "--reset")');
    expect(safety).toContain("--reset は廃止しました");
  });
});
