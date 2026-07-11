/**
 * Defensive lint — `infra/monitoring/alert-policies/*.yaml` に **active**
 * `REPLACE_ME` プレースホルダが merge されないよう回帰防止する。
 *
 * ## Why
 *
 * 各 alert policy YAML は運用者が Cloud Monitoring notification channel を
 * 作成した後で `notificationChannels` に channel resource path を埋める設計。
 * 本 repo では初期状態として **コメントアウトされたテンプレート行** を残す慣習で:
 *
 *   notificationChannels:
 *     # - projects/myrrh-rental-space/notificationChannels/REPLACE_ME
 *
 * になっている。「コメント外し忘れの `REPLACE_ME` が本番デプロイに流れる」
 * silent-noop 事故（誰も通知が来ないまま alert が発火して気づかない）を防ぐため、
 * **YAML の active な line に `REPLACE_ME` が来たら** 本テストが fail する。
 *
 * ## What passes / what fails
 *
 * PASS:
 *   notificationChannels:
 *     # - projects/foo/notificationChannels/REPLACE_ME     ← コメント
 *
 * PASS:
 *   notificationChannels:
 *     - projects/foo/notificationChannels/1234567890       ← 実 channel ID
 *
 * FAIL:
 *   notificationChannels:
 *     - projects/foo/notificationChannels/REPLACE_ME       ← active placeholder
 *
 * documentation ブロックや説明文の `REPLACE_ME` 記述は許容する
 * (list item ではないため配信への影響なし)。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALERT_POLICY_DIR = join(
  process.cwd(),
  "infra",
  "monitoring",
  "alert-policies",
);

function readYamlFiles(): Array<{ filename: string; content: string }> {
  const entries = readdirSync(ALERT_POLICY_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => ({
      filename: entry.name,
      content: readFileSync(join(ALERT_POLICY_DIR, entry.name), "utf8"),
    }));
}

/**
 * YAML の line-level pattern:
 * - 先頭は空白のみ (indent は許容)
 * - `#` が先頭に来ないこと (コメント行を除外)
 * - `-` から始まる list item
 * - `projects/<any>/notificationChannels/REPLACE_ME` を含む
 *
 * `notificationChannels` 直下の list 記法だけを対象にする。documentation の
 * 説明文中で `REPLACE_ME` に触れる場合 (list item ではない) は許容する。
 */
const ACTIVE_PLACEHOLDER_LINE =
  /^[^\S\n]*-[^\S\n]+projects\/[^/\s]+\/notificationChannels\/REPLACE_ME\b/;

describe("alert-policies: no active REPLACE_ME placeholder", () => {
  const files = readYamlFiles();

  test("alert-policy directory contains at least one YAML (lint gate has real files to check)", () => {
    // Sanity: リポジトリ構造変更で対象ディレクトリが消えた場合に本テストが偽陰性で
    // pass するのを防ぐ (何もチェックしていない = 常に緑になる silent 化を回避)。
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { filename, content } of files) {
    test(`${filename} does not carry an active notificationChannels REPLACE_ME`, () => {
      const violatingLines: Array<{ lineNumber: number; text: string }> = [];
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        if (ACTIVE_PLACEHOLDER_LINE.test(line)) {
          violatingLines.push({ lineNumber: i + 1, text: line });
        }
      }
      if (violatingLines.length > 0) {
        const summary = violatingLines
          .map(({ lineNumber, text }) => `  L${lineNumber}: ${text.trimEnd()}`)
          .join("\n");
        throw new Error(
          [
            `${filename} has ${violatingLines.length} active REPLACE_ME line(s).`,
            "Replace with a real Cloud Monitoring notificationChannel resource path,",
            'or comment the line out ("# - projects/...") until the operator wires it up.',
            "Silent-noop alerts (empty notificationChannels) are what this gate exists to prevent.",
            "",
            "Offending line(s):",
            summary,
          ].join("\n"),
        );
      }
    });
  }
});
