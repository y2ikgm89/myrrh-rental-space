/**
 * PreToolUse hook — 検証を迂回するコマンドを拒否する。
 *
 * ## なぜ hook なのか
 *
 * 「--no-verify を使わない」を CLAUDE.md に書いても、それは指示であって強制ではない
 * （公式: "an instruction is the wrong tool ... A real guardrail needs to be
 * deterministic, and the enforcement methods are hooks and permissions"）。
 * ここで止めているのは **緑を偽装できてしまう経路** だけで、判断を要するものは
 * 一切見ない。
 *
 * ## 何を拒否するか
 *
 * | パターン                     | 迂回されるもの                                          |
 * | ---------------------------- | ------------------------------------------------------- |
 * | `--no-verify` / `commit -n`  | lefthook（type-check・architecture gate・保護ファイル）  |
 * | `LEFTHOOK=0` 等              | 同上（環境変数での全 hook 無効化）                       |
 * | `-c core.hooksPath=`         | 同上（無言で全 hook を skip する）                       |
 * | 素の `bun test`              | per-file isolation runner（mock.module のプロセス汚染）  |
 *
 * `bun run test` / `bun run test:unit` / `bun scripts/run-tests.ts` は通す。
 *
 * ## 設計
 *
 * - **fail open**: 入力が壊れていたら allow する。ガードの誤爆で作業が止まる
 *   方が、稀な取りこぼしより高くつく。
 * - **stdout は常に 1 個の JSON オブジェクト。** Cursor は空 stdout や bun の
 *   usage バナーを "not valid JSON" として **action ごと block** する。
 *   allow でも黙って exit してはいけない。
 * - 判定は生のコマンド文字列に対して行う。permissions の Bash glob は
 *   引数位置の制約に弱い（公式が "fragile" と明記）ため、ここで見る。
 * - このファイルは `.claude/**` にあるので ESLint 対象外・tsconfig 対象外。
 *   依存を持たない単一ファイルに保つこと。
 *
 * 起動は bun（このリポジトリのランタイム）。`command` にスクリプトパスまで
 * 含める — Cursor は `args` を渡さず `command` だけを実行することがあり、
 * 素の `bun` は usage を stdout に出して JSON を壊す。`shell: powershell` は
 * PATH 上の `bash` が WSL ランチャのため。
 */

import { readFileSync } from "node:fs";

/** @typedef {{ pattern: RegExp, reason: string }} Guard */

/** @type {Guard[]} */
const GUARDS = [
  {
    pattern: /--no-verify\b/u,
    reason:
      "--no-verify は lefthook（type-check / architecture gate / 保護ファイル検査）を丸ごと飛ばす。hook が落ちるなら原因を直すこと。",
  },
  {
    pattern: /\bgit\s+(?:-\S+\s+)*commit\b[^;&|]*\s-n(?=\s|$)/u,
    reason:
      "git commit -n は --no-verify と同義。lefthook を飛ばさずに commit すること。",
  },
  {
    pattern: /\bLEFTHOOK(?:_EXCLUDE)?=/u,
    reason:
      "LEFTHOOK 環境変数による hook の無効化は禁止。個別の job が邪魔なら lefthook.yml を直すこと。",
  },
  {
    pattern: /-c\s+core\.hooksPath=/u,
    reason:
      "core.hooksPath の上書きは全 hook を無言で skip する（何も出力されないので気づけない）。",
  },
  {
    pattern: /(?:^|[;&|]\s*|\(\s*)bun\s+(?:--\S+\s+)*test(?=\s|$)/u,
    reason:
      "素の bun test は禁止。mock.module がプロセスグローバルに残り他ファイルを汚染する。bun scripts/run-tests.ts <file> か bun run test:unit を使うこと。",
  },
];

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function writeDecision(decision, reason) {
  const hookSpecificOutput = {
    hookEventName: "PreToolUse",
    permissionDecision: decision,
  };
  if (reason !== undefined) {
    hookSpecificOutput.permissionDecisionReason = reason;
  }
  /** Cursor preToolUse は `permission`、Claude Code は `hookSpecificOutput`。 */
  const payload = { permission: decision, hookSpecificOutput };
  if (reason !== undefined) {
    payload.agent_message = reason;
  }
  process.stdout.write(JSON.stringify(payload));
}

function main() {
  const raw = readStdin();
  if (raw.trim() === "") {
    writeDecision("allow");
    return;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    writeDecision("allow");
    return;
  }

  const command = input?.tool_input?.command;
  if (typeof command !== "string" || command === "") {
    writeDecision("allow");
    return;
  }

  const hit = GUARDS.find((guard) => guard.pattern.test(command));
  if (hit === undefined) {
    writeDecision("allow");
    return;
  }

  writeDecision("deny", hit.reason);
}

main();
