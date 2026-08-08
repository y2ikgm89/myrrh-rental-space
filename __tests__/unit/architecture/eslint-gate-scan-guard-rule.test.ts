/**
 * `local/gate-scan-must-not-be-silently-empty` の検証。
 *
 * ## なぜ ESLint の `RuleTester` を使うのか
 *
 * この repo の gate は「走査して違反 0 件を assert する」形が大半で、その形は
 * **走査が 0 件でも緑になる**。それを禁じる rule 自身が同じ穴を持っては意味がない。
 *
 * `RuleTester` は **valid と invalid の両方を要求し、invalid には期待エラーの
 * 明示を要求する**（ESLint 公式）。つまり「何も検出しない rule」は物理的に
 * 通らない。これが「gate を ESLint へ移す」ことの実利で、
 * `expect(offenders).toEqual([])` 型の自前 gate には無い性質。
 *
 * 配線（`eslint.config.mjs` でこの rule が実際に有効になっているか）は末尾で見る。
 * rule が正しくても config に載っていなければ 1 行も検査されない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RuleTester } from "eslint";
import { describe, expect, test } from "bun:test";

import rule from "../../../eslint-rules/gate-scan-must-not-be-silently-empty.mjs";

const RULE_NAME = "gate-scan-must-not-be-silently-empty";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2024, sourceType: "module" },
});

describe(RULE_NAME, () => {
  test("走査して空 assert する gate に規模の下限を要求する", () => {
    ruleTester.run(RULE_NAME, rule, {
      valid: [
        // 下限を assert している（本来の形）
        {
          code: `
            const files = readdirSync(root);
            expect(files.length).toBeGreaterThan(10);
            expect(files.filter(bad)).toEqual([]);
          `,
        },
        // toContain も「空でない」ことを示す
        {
          code: `
            const dirs = readdirSync(root);
            expect(dirs).toContain("00000000000000_init");
            expect(dirs.filter(bad)).toEqual([]);
          `,
        },
        // 走査していない（固定パスを読むだけ）gate は対象外。
        // パスが消えれば readFileSync が throw するので黙って緑にならない。
        {
          code: `
            const source = readFileSync(path, "utf8");
            expect(source.split("\\n").filter(bad)).toEqual([]);
          `,
        },
        // 走査はするが空 assert はしない（直接 assert 型）
        {
          code: `
            const files = readdirSync(root);
            expect(files.map(name)).toMatchObject({ ok: true });
          `,
        },
        // 空でない配列との比較は「空 assert」ではない
        {
          code: `
            const files = readdirSync(root);
            expect(files).toEqual(["a"]);
          `,
        },
      ],
      invalid: [
        // readdirSync + toEqual([])、下限なし
        {
          code: `
            const files = readdirSync(root);
            expect(files.filter(bad)).toEqual([]);
          `,
          errors: [{ messageId: "missingScanGuard" }],
        },
        // toHaveLength(0) も空 assert
        {
          code: `
            const files = readdirSync(root);
            expect(files.filter(bad)).toHaveLength(0);
          `,
          errors: [{ messageId: "missingScanGuard" }],
        },
        // git ls-files で一覧を得る形
        {
          code: `
            const tracked = execFileSync("git", ["ls-files"], {}).toString();
            expect(tracked.split("\\n").filter(bad)).toEqual([]);
          `,
          errors: [{ messageId: "missingScanGuard" }],
        },
        // globSync も走査
        {
          code: `
            const specs = globSync("e2e/**/*.spec.ts");
            expect(specs.filter(bad)).toStrictEqual([]);
          `,
          errors: [{ messageId: "missingScanGuard" }],
        },
      ],
    });
  });

  test("この rule が eslint.config.mjs で実際に有効になっている", () => {
    // rule が正しくても、配線が外れていれば 1 行も検査されない。
    const config = readFileSync(
      join(process.cwd(), "eslint.config.mjs"),
      "utf8",
    );

    expect(config).toContain(`"local/${RULE_NAME}"`);
    expect(config).toContain("__tests__/unit/architecture/**");

    // plugin へ登録されていること（config だけ書いても解決できない）
    const plugin = readFileSync(
      join(process.cwd(), "eslint-rules", "index.mjs"),
      "utf8",
    );
    expect(plugin).toContain(RULE_NAME);
  });
});
