/**
 * `__tests__/unit` を JSDOM preload 抜きの bunfig で起動する判定。
 *
 * ## なぜ
 *
 * `bunfig.toml` の `[test] preload` は `setup-dom.ts`（JSDOM 一式）を **すべての
 * テストファイル**に読み込ませる。1 ファイル 1 サブプロセスで回すランナーでは、
 * この固定費が起動のたびに乗る。
 *
 * `__tests__/unit` の 821 本を両モードで全件実行した実測:
 *
 * | 起動 | 逐次換算 CPU | 並列 8 の実時間 | 失敗 |
 * | --- | --- | --- | --- |
 * | 既定 bunfig（JSDOM preload あり） | 913.7s | 114.5s | 0 |
 * | `bunfig.nodom.toml`               | **293.7s** | **36.8s** | 26 |
 *
 * 落ちた 26 本が下の DOM_REQUIRED_* で、それ以外の 795 本は DOM を必要としない。
 *
 * ## なぜ「既定を DOM 抜き」に反転しているのか
 *
 * 以前はツリーの allowlist（architecture だけ opt-in）だった。反転できるのは、
 * **DOM が要るのに DOM 抜きで起動したテストは必ず落ちる**から。無言で通り抜ける
 * 方向の事故が起きない以上、既定を速いほうに置いて、落ちたものを下のリストへ
 * 足すのが正しい向き。新しく DOM を使うテストを書いた人は、緑にするために必ず
 * ここを通る。
 *
 * ## 例外: 落ちずに分岐だけ反転するコード
 *
 * `typeof window === "undefined"` のようなガードは、DOM が消えても**落ちずに
 * サーバー側の分岐へ倒れる**。これは上の「必ず落ちる」の唯一の穴なので、
 * `src` 全体を数えて潰してある（2026-08-10 時点で 15 箇所）。
 *
 * - module load 時に評価されるのは `lexical-draggable-block-plugin.ts` の
 *   `CAN_USE_DOM` だけ。import 元は `DraggableBlockPlugin.tsx` のみで、
 *   `DOM_REQUIRED_PREFIXES` の lexical ツリーに入る。
 * - 残り 14 箇所はすべて関数の中。呼べば DOM を触るので落ちる。
 *
 * **ここに新しい module-level のガードを足すなら、それを読むテストを
 * `DOM_REQUIRED_*` に入れること。** 落ちないぶん、誰も気づけない。
 *
 * ## `__tests__/integration` を含めていない理由
 *
 * 全件実行で確かめていないから。含めるなら先に同じ全件実行をやる。
 * 「たぶん DOM を使わない」で広げると、上の穴を検証なしで踏むことになる。
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
 * DOM 抜きを**既定**にするツリー（repo 相対・POSIX 区切り・末尾スラッシュ必須）。
 *
 * 末尾スラッシュを外すと `__tests__/unit-something/` まで前方一致で巻き込む。
 */
export const NO_DOM_DEFAULT_TREES = ["__tests__/unit/"] as const;

/**
 * DOM が要る拡張子。React コンポーネントを render するテストは全部これ。
 *
 * 35 本中 22 本は DOM 抜きだと実際に落ちる。残り 13 本も DOM を渡しておく
 * （合計 8 CPU 秒ぶんで、`.tsx` かどうかという判定の単純さを買う）。
 */
export const DOM_REQUIRED_EXTENSIONS = [".test.tsx"] as const;

/** DOM が要るツリー（末尾スラッシュ必須）。Lexical は `.ts` でも DOM を要求する。 */
export const DOM_REQUIRED_PREFIXES = [
  "__tests__/unit/components/editor/lexical/",
] as const;

/** DOM が要る単独ファイル。DOMPurify は jsdom の `window` が無いと初期化できない。 */
export const DOM_REQUIRED_FILES = [
  "__tests__/unit/lib/html/sanitize-dompurify-html.test.ts",
] as const;

/** DOM 抜きの bunfig。cwd（repo root）からの相対で解決される。 */
export const NO_DOM_BUNFIG_PATH = "bunfig.nodom.toml";

/**
 * そのテストファイルを起動するときに `bun test` へ足す引数。
 *
 * DOM が要ると判定したら空配列を返す（既定の `bunfig.toml` が使われる）。
 */
export function noDomBunfigArgs(file: string): readonly string[] {
  const normalized = file.replaceAll("\\", "/");

  const inScope = NO_DOM_DEFAULT_TREES.some((tree) =>
    normalized.startsWith(tree),
  );
  if (!inScope) return [];

  const needsDom =
    DOM_REQUIRED_EXTENSIONS.some((ext) => normalized.endsWith(ext)) ||
    DOM_REQUIRED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    DOM_REQUIRED_FILES.some((exact) => exact === normalized);
  if (needsDom) return [];

  return [`--config=${NO_DOM_BUNFIG_PATH}`];
}
