/**
 * Next 同梱 path-to-regexp の最小型宣言。
 *
 * `next.config.ts` の `headers()` の `source` は path-to-regexp 構文の文字列で、
 * **目で読んでも当たり外れが分からない**。実際に 2 つの欠陥がそこから出た
 * （監査 F-73 / F-18）。`__tests__/unit/architecture/cdn-header-source-matching.test.ts`
 * が実 URL でマッチを取って固定するために、Next が実際に使う実装をそのまま読む。
 *
 * 別バージョンの path-to-regexp を dependency に足すと、**Next の挙動とずれた
 * ものを検査する**ことになるので入れない（同梱版は `\` を剥がす等の癖がある）。
 * 同梱物には型が無いのでここで宣言する。使うのは `pathToRegexp` だけ。
 */
declare module "next/dist/compiled/path-to-regexp" {
  export function pathToRegexp(source: string): RegExp;
}
