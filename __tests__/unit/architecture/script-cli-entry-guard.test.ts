import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Glob } from "bun";
import { describe, expect, test } from "bun:test";

/**
 * テストから import される `scripts/**` が、**import しただけで CLI 本体を
 * 実行しない**ことを強制する gate。
 *
 * ## 何が起きるか
 *
 * module scope に `process.exit()` を置いたスクリプトを test が静的 import すると、
 * **assertion が 1 つも走らないままプロセスが死ぬ**。`bun scripts/run-tests.ts` は
 * ファイルごとに別プロセスなので、落ちるのはそのファイル 1 つ — つまり
 * 「テストが無言で消える」形になり、失敗としてすら見えにくい。
 *
 * 実測（#1843 の Codex 指摘）: `assert-destructive-db-target.ts` は
 * 本番らしい `DIRECT_URL` を見ると `process.exit(1)` する。テストが純関数を
 * import するだけでこれが走るため、**開発者の `.env.local` に本物の `DIRECT_URL` が
 * 入っている環境でだけ**テストが死ぬ。`__tests__/setup.ts` が固定するのは
 * `DATABASE_URL` だけで `DIRECT_URL` は素通りするので、preload では防げない。
 * しかもそれはガードが守ろうとしている状況そのものだった。
 *
 * ## 何を強制するか
 *
 * `__tests__/**` から import されている `scripts/**` のうち、module scope で
 * `process.exit(` を呼ぶものは `import.meta.main` で囲む
 * （`scripts/lint-format.ts` など既存スクリプトの house pattern）。
 */

const root = process.cwd();

/** `__tests__/**` が import している `scripts/**` の相対パスを集める。 */
function scriptsImportedFromTests(): string[] {
  const imported = new Set<string>();

  for (const relative of new Glob("**/*.test.ts").scanSync(
    join(root, "__tests__"),
  )) {
    const source = readFileSync(join(root, "__tests__", relative), "utf8");
    for (const match of source.matchAll(
      /from\s+"((?:\.\.\/)+scripts\/[^"]+)"/gu,
    )) {
      const specifier = match[1];
      if (!specifier) continue;
      const tail = specifier.slice(specifier.indexOf("scripts/"));
      imported.add(tail.endsWith(".ts") ? tail : `${tail}.ts`);
    }
  }

  return [...imported].sort();
}

describe("test から import される script の CLI 入口", () => {
  test("module scope で process.exit しない", () => {
    const violations: string[] = [];

    for (const relative of scriptsImportedFromTests()) {
      const source = readFileSync(join(root, relative), "utf8");
      if (!source.includes("process.exit(")) continue;

      if (!source.includes("import.meta.main")) {
        violations.push(
          `${relative}: test から import されるのに CLI 本体が module scope にある。import しただけで process.exit が走り、assertion が 1 つも実行されない。\`if (import.meta.main) { ... }\` で囲むこと`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("gate が対象を 1 件も見ていない、という空振りをしない", () => {
    expect(scriptsImportedFromTests().length).toBeGreaterThan(0);
  });
});
