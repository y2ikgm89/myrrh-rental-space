import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * Prisma generator の module format 契約 gate。
 *
 * このリポジトリは package.json に `"type"` を持たない = **CommonJS プロジェクト**。
 * Playwright は ESM/CJS を自前で決めず Node のセマンティクス（ファイル拡張子 +
 * 最寄り package.json の `type`）に委譲するため、`e2e/**` の TypeScript は
 * 必ず CommonJS へトランスパイルされる。tsconfig の `module` 設定は無視される
 * （Playwright が解釈するのは allowJs / baseUrl / paths / references / extends のみ）。
 *
 * 一方 `prisma-client` generator は moduleFormat が esm だと
 * `globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))` を出力する。
 * これが CJS へ変換されると `SyntaxError: Cannot use 'import.meta' outside a module`
 * になり、生成 client を import する `e2e/helpers/*.ts` 経由で
 * **E2E テストが 1 件も起動できなくなる**。
 *
 * 実害: 2026-07-30 の full CI dispatch で "E2E Tests" job が全滅した。
 *
 * `moduleFormat = "cjs"` は「このリポジトリが CJS である」という事実の明示であり、
 * 生成物から import.meta を消す。`__dirname` は `@prisma/client/runtime` 側が
 * 供給する（CJS ビルドはネイティブ、ESM ビルドは自身の banner が globalThis に設定）ため
 * 生成 client 側の preamble は不要。
 *
 * この gate は「package.json が CJS のままなら generator も cjs でなければならない」を
 * 強制する。将来リポジトリ全体を ESM 化する（package.json に `"type": "module"` を足す）
 * 場合は、その PR で moduleFormat の指定を外す/esm にすること。
 */

const schemaSource = readFileSync(
  join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const packageJsonSource = readFileSync(
  join(process.cwd(), "package.json"),
  "utf8",
);

function readGeneratorBlock(): string {
  const start = schemaSource.indexOf("generator client {");
  expect(start).toBeGreaterThan(-1);
  const end = schemaSource.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return schemaSource.slice(start, end);
}

describe("Prisma client module format contract", () => {
  test("generator module format matches the package's module system", () => {
    const packageJson: unknown = JSON.parse(packageJsonSource);
    const packageType =
      typeof packageJson === "object" &&
      packageJson !== null &&
      "type" in packageJson
        ? (packageJson as { type: unknown }).type
        : undefined;

    const generatorBlock = readGeneratorBlock();

    if (packageType === "module") {
      // リポジトリを ESM 化した場合は cjs 固定を外すこと（Playwright も ESM で読む）。
      expect(generatorBlock).not.toContain('moduleFormat    = "cjs"');
      return;
    }

    // CommonJS プロジェクト = Playwright が CJS へ変換する = import.meta は使えない。
    expect(generatorBlock).toMatch(/moduleFormat\s*=\s*"cjs"/);
  });

  test("generated client carries no import.meta", () => {
    const clientPath = join(process.cwd(), "generated/prisma/client.ts");

    // `bun run test:unit` は db:generate 済みで実行される。未生成環境では
    // 上の schema 契約テストだけで gate は成立するため skip する。
    if (!existsSync(clientPath)) return;

    expect(readFileSync(clientPath, "utf8")).not.toContain("import.meta");
  });
});
