/**
 * DOM を必要としないテストを、JSDOM preload 抜きの bunfig で起動する判定。
 *
 * ## なぜ
 *
 * `bunfig.toml` の `[test] preload` は `setup-dom.ts`（JSDOM 一式）を **すべての
 * テストファイル**に読み込ませる。1 ファイル 1 サブプロセスで回すランナーでは、
 * この固定費が起動のたびに乗る。
 *
 * 実測（architecture gate 12 本を交互に実行）:
 *
 * | 起動 | 12 本の合計 |
 * | --- | --- |
 * | 既定 bunfig（JSDOM preload あり） | 8,814 ms |
 * | `bunfig.nodom.toml`               | **1,680 ms** |
 *
 * 1 ファイルあたり **-594 ms**。`__tests__/unit/architecture/` の 171 本に効かせると
 * 約 -101 CPU 秒（並列 4 なら実時間で -25 秒前後）。
 *
 * ## なぜ architecture ツリーだけなのか
 *
 * ここの gate は FS 走査と正規表現しか使わず、`src/` を実行時 import しない。
 * DOM を触らないことは「171 本すべてを `bunfig.nodom.toml` で実行して失敗 0」で
 * 実測済み。
 *
 * 他のツリーへ広げるのは**別の判断**。`typeof window === "undefined"` のような
 * ガードを持つコードは、DOM が消えると**落ちずに分岐が反転する**（silent）。
 * 広げるなら、そのツリーで同じ全件実行を先にやること。
 *
 * ## 等号形でしか効かない
 *
 * `bun --help` の表記は `-c, --config=<val>`。実測すると:
 *
 * | 形 | preload が走るか |
 * | --- | --- |
 * | `--config=<path>` | **走る** |
 * | `--config <path>` | 走らない（黙って無視） |
 * | `-c <path>`       | 走らない（黙って無視） |
 *
 * スペース形は **silent no-op**。差分は入り、テストは緑、なのに速くならない。
 * ここを間違えると「入れたのに効かない」に気づけないので、定数として固定する。
 */

/**
 * DOM 抜きで起動してよいツリー（repo 相対・POSIX 区切り・末尾スラッシュ必須）。
 *
 * 末尾スラッシュを外すと `__tests__/unit/architecture-boundaries.test.ts` まで
 * 巻き込む。あれは同名の別ファイルで、ここの対象ではない。
 */
export const NO_DOM_TEST_TREES = ["__tests__/unit/architecture/"] as const;

/** DOM 抜きの bunfig。cwd（repo root）からの相対で解決される。 */
export const NO_DOM_BUNFIG_PATH = "bunfig.nodom.toml";

/**
 * そのテストファイルを起動するときに `bun test` へ足す引数。
 *
 * 対象外なら空配列を返す（既定の `bunfig.toml` が使われる）。
 */
export function noDomBunfigArgs(file: string): readonly string[] {
  const normalized = file.replaceAll("\\", "/");
  const eligible = NO_DOM_TEST_TREES.some((tree) =>
    normalized.startsWith(tree),
  );
  return eligible ? [`--config=${NO_DOM_BUNFIG_PATH}`] : [];
}
