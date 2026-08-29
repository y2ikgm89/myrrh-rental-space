/**
 * ランナー（`scripts/run-tests.ts`）が 1 ファイルぶんの結果をどこまで出すか。
 *
 * ## なぜ
 *
 * ランナーは成功したファイルの本文も無条件に出していた。1 ファイルあたり 7 行が
 * 定型で、成功時の情報量はゼロ（`bun test v…` / 空行 / `N pass` / `0 fail` /
 * `N expect() calls` / `Ran N tests across 1 file.` と、ランナー自身の PASS 行）。
 *
 * `__tests__/unit` 950 本の実測（2026-08-30）:
 *
 * | 出し方 | 行 | 字 |
 * | --- | --- | --- |
 * | 全部出す（従来）             | 7,678 | 227,575 |
 * | 本文だけ抑制（PASS 行は残す）|   953 |  87,713 |
 * | 成功ファイルは黙る（現行）   |     5 |     364 |
 *
 * エージェントが読む Bash ツールの出力上限は **30,000 字**（実測: 29,900 字は
 * 全文が返り、30,100 字はファイルへ退避されて先頭 2KB だけが返る）。
 * 従来の 227,575 字はこの上限を 7.6 倍超えるので退避され、返るのは先頭 2KB
 * ＝ **合否も失敗ファイル名も含まない部分**だった。合否を知るには grep を
 * 追加で撃つしかない。本文だけ抑制しても 87,713 字で上限を割らないため、
 * PASS 行そのものを間引く必要がある。
 *
 * ## 何を決めるか
 *
 * - **本文は「失敗したファイル」か「TTY」のとき**。上限があるのは非 TTY
 *   （CI とエージェント）だけで、端末の人間を絞る理由が無い。**成功したテストに
 *   仕込んだ `console.log` が消えると、デバッグの手が 1 本折れる**ので、
 *   TTY では従来どおり全部出す。
 *   非 TTY で捨てる出力の中に本物の警告が混ざらないことは、
 *   `__tests__/helpers/console-guard.ts` が別途保証する
 *   （React / jsdom の警告はテストを落とすので、本文ごと出る）。
 * - **PASS 行は TTY なら全件**。人間が 60 秒待つ間の進捗表示は消さない。
 * - **非 TTY（CI とエージェント）は 10% 刻み**。ファイル数によらず最大 10 行に
 *   収まり、「動いているか」は分かる。無言にはしない。
 * - **FAIL 行は常に出す**。ただし下の総量予算には従う。
 *
 * ## 大量失敗の予算
 *
 * 1 失敗あたりの出力は実測 **約 617 字**（20 件失敗で 12,350 字）。**48 件を
 * 超えると 30,000 字を割り込み**、集計行と失敗ファイル一覧が読み手に届かなくなる。
 * このリポジトリでは `crypto` の transitive import で 39 ファイルが一斉に落ちた
 * 実績があり、境界の内側ではない。
 *
 * そこで非 TTY のときだけ**総量予算**を持つ。予算を使い切ったら本文も 1 行
 * サマリも止め、代わりに
 *
 * - 何件ぶんを省略したか
 * - 全文を書き出したファイルのパス
 *
 * を最後に出す。**黙って切らない**（省略した事実が出ないと、読み手は「全部
 * 見えている」と誤解する）。全文はファイルに残るので情報は失われない。
 */

/** 非 TTY で進捗行を出す刻み数。10 なら 10% ごと＝最大 10 行。 */
const PROGRESS_STEPS = 10;

/**
 * 非 TTY で 1 回の実行が出してよい総量（字）。
 *
 * **これは上限ではなく閾値。** 判定は本文を書く「前」に行うので、実際の総量は
 * この値 + 最後に通した 1 ファイルの本文 + 末尾（集計行・省略告知・失敗一覧
 * 最大 21 行）まで膨らむ。外部ツールの上限 30,000 字に対して 10,000 字ぶんの
 * 余裕を残してある（実測: 51 ファイル失敗で総量 23,500 字前後）。
 */
export const NON_TTY_OUTPUT_BUDGET_CHARS = 20_000;

/** 失敗ファイル一覧に並べる最大件数。超えたぶんは「他 N 件」と明示する。 */
export const FAILED_FILE_LIST_LIMIT = 20;

export interface OutputDecision {
  /** サブプロセスの stdout / stderr をそのまま流すか。 */
  body: boolean;
  /** そのファイルの 1 行サマリ（PASS / FAIL 行）を出すか。 */
  perFileLine: boolean;
}

export interface OutputDecisionInput {
  /** サブプロセスの終了コード。0 以外は失敗。 */
  exitCode: number;
  /** 出力先が端末か。`process.stdout.isTTY` を渡す。 */
  isTty: boolean;
  /** このファイルを含めて何件終わったか（1 始まり）。 */
  doneCount: number;
  /** 実行対象の総ファイル数。 */
  totalFiles: number;
  /** ここまでに実際に書き出した字数。非 TTY の総量予算に使う。 */
  emittedChars: number;
}

/** `doneCount` が 10% 刻みの境界をまたいだか。 */
function crossesProgressStep(doneCount: number, totalFiles: number): boolean {
  if (totalFiles <= 0) return false;
  const stepOf = (count: number): number =>
    Math.floor((count * PROGRESS_STEPS) / totalFiles);
  return stepOf(doneCount) > stepOf(doneCount - 1);
}

/**
 * `bun test` のサマリ行から、そのファイルが実行したテスト数を読む。
 *
 * 本文を抑制すると `Ran N tests across 1 file.` も消える。件数が消えると
 * 「全部 skip されて 0 件で緑」を集計から見分けられなくなるので、ランナーが
 * 拾って最終行に畳み込む。読めなければ `null` を返し、呼び出し側が
 * 「読めなかった件数」として別に数える（黙って 0 に落とさない）。
 */
export function parseRanTestCount(stderr: string): number | null {
  const matched = /^Ran (\d+) tests? across \d+ files?\./mu.exec(stderr);
  if (matched === null) return null;
  const parsed = Number.parseInt(matched[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 失敗ファイル一覧を、件数の上限つきで組み立てる。
 *
 * 上限を超えたぶんは **黙って消さず**「他 N 件」を最後に足す。件数を書かないと
 * 読み手が一覧を全件だと誤解する。
 */
export function formatFailedFileLines(
  files: readonly string[],
  limit: number,
): string[] {
  const shown = files.slice(0, limit).map((file) => `  - ${file}`);
  const hidden = files.length - shown.length;
  if (hidden <= 0) return shown;
  return [...shown, `  ... 他 ${String(hidden)} 件`];
}

export function decideOutput(input: OutputDecisionInput): OutputDecision {
  const failed = input.exitCode !== 0;
  if (input.isTty) return { body: true, perFileLine: true };

  // 非 TTY は総量予算に従う。使い切ったら本文も 1 行サマリも止める。
  // 止めた事実と全文の在処は呼び出し側が最後に必ず出す。
  if (input.emittedChars >= NON_TTY_OUTPUT_BUDGET_CHARS) {
    return { body: false, perFileLine: false };
  }

  return {
    body: failed,
    perFileLine:
      failed || crossesProgressStep(input.doneCount, input.totalFiles),
  };
}
