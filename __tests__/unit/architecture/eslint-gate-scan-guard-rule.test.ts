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
 * **`ruleTester.run()` は `test()` の中で呼ばない。** RuleTester は自前で
 * `describe` / `it` を張るので、テストの中から呼ぶと bun が
 * `Cannot call describe() inside a test` で落ちる（CI で実測）。
 */

import { ESLint, RuleTester } from "eslint";
import { describe, expect, test } from "bun:test";

import rule from "../../../eslint-rules/gate-scan-must-not-be-silently-empty.mjs";

const RULE_ID = "local/gate-scan-must-not-be-silently-empty";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2024, sourceType: "module" },
});

ruleTester.run("gate-scan-must-not-be-silently-empty", rule, {
  valid: [
    // 数値の下限を assert している（本来の形）
    {
      code: `
        const files = readdirSync(root);
        expect(files.length).toBeGreaterThan(10);
        expect(files.filter(bad)).toEqual([]);
      `,
    },
    // toBeGreaterThanOrEqual(1) も「1 件以上」を証明する
    {
      code: `
        const files = readdirSync(root);
        expect(files.length).toBeGreaterThanOrEqual(1);
        expect(files.filter(bad)).toEqual([]);
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
    // **toContain は下限を証明しない。** 受け手を見ないので、無関係な文字列検査で
    // ファイル全体が「guard あり」になっていた（初版の穴。Codex 指摘）。
    {
      code: `
        const files = readdirSync(root);
        expect(readFileSync(files[0], "utf8")).toContain("<html");
        expect(files.filter(bad)).toEqual([]);
      `,
      errors: [{ messageId: "missingScanGuard" }],
    },
    // `>= 0` は常に真なので下限にならない
    {
      code: `
        const files = readdirSync(root);
        expect(files.length).toBeGreaterThanOrEqual(0);
        expect(files.filter(bad)).toEqual([]);
      `,
      errors: [{ messageId: "missingScanGuard" }],
    },
    // 否定形は下限にならない
    {
      code: `
        const files = readdirSync(root);
        expect(files.length).not.toBeGreaterThan(5);
        expect(files.filter(bad)).toEqual([]);
      `,
      errors: [{ messageId: "missingScanGuard" }],
    },
  ],
});

describe("gate-scan-must-not-be-silently-empty の配線", () => {
  test("architecture テストに対して実効設定で error になっている", async () => {
    // **文字列一致で確かめない。** `eslint.config.mjs` に rule 名が現れることは
    // 「有効である」ことを意味しない——`"off"` でも、対象 files に当たらない
    // ブロックに書かれていても、コメントの中にあっても文字列は一致する
    //（Codex 指摘）。ESLint に flat config を解決させて実効の severity を見る。
    const eslint = new ESLint();
    const config = await eslint.calculateConfigForFile(
      "__tests__/unit/architecture/admin-read-boundaries.test.ts",
    );

    // 解決結果は数値 severity（2 = error）を含む配列。
    expect(config.rules?.[RULE_ID]?.[0]).toBe(2);
  });

  test("architecture 以外には適用されない（対象の絞り込みが効いている）", async () => {
    const eslint = new ESLint();
    const config = await eslint.calculateConfigForFile(
      "src/shared/lib/date-format.ts",
    );

    expect(config.rules?.[RULE_ID]).toBeUndefined();
  });
});
