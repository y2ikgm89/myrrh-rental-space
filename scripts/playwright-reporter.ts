import type { PlaywrightTestConfig } from "@playwright/test";

/**
 * Playwright の reporter 選択。
 *
 * ## なぜ
 *
 * 以前は `[["html", ...], ["list"]]` と `list` を**常時**固定していた。`list` は
 * テスト 1 本につき 1 行出す。この repo の E2E は **381 tests / 83 files** で、
 * 列挙するだけで 69,587 字（384 行）になる。**エージェントが読む Bash ツールの
 * 出力上限 30,000 字の 2.3 倍**で、超えるとファイルへ退避され先頭 2KB しか
 * 返らない。返る 2KB には合否も失敗一覧も入らない。
 *
 * ## 何を見るか
 *
 * Playwright 自身の既定は非対話なら `dot`、対話なら `list`
 * （1.62.1 の実体: `var defaultReporter = process.env.CI ? "dot" : "list"`）。
 * ここはその**考え方をそのまま使い、判定だけ `CI` から TTY に置き換える**。
 *
 * | 実行者 | isTty | reporter | 公式既定と同じか |
 * | --- | --- | --- | --- |
 * | 人間（端末） | true | `list` | 同じ |
 * | CI（GitHub Actions） | false | `dot` | 同じ（CI は常に非 TTY） |
 * | エージェント（パイプ） | false | `dot` | **違う**（公式は `list`） |
 *
 * `CI` ではなく TTY を見る理由は最後の行。エージェントは `CI` を立てないので、
 * 公式の判定では `list` に落ちて 69,587 字を出す。TTY は「対話的か」を直接
 * 見ているので、公式が意図した区別をより正確に表す。
 *
 * `html` reporter は**どちらでも残す**。失敗の詳細（trace / スクリーンショット）は
 * そちらに全部あるので、stdout を絞っても情報は失われない。
 * CI は `playwright-report` を artifact として上げている。
 *
 * @see https://playwright.dev/docs/test-reporters
 */
export function resolvePlaywrightReporters(
  isTty: boolean,
): NonNullable<PlaywrightTestConfig["reporter"]> {
  return [
    ["html", { outputFolder: "playwright-report" }],
    [isTty ? "list" : "dot"],
  ];
}
