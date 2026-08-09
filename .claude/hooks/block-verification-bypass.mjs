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
 * - **fail open**: 入力が壊れていたら何も言わずに通す。ガードの誤爆で作業が
 *   止まる方が、稀な取りこぼしより高くつく。
 * - 判定は生のコマンド文字列に対して行う。permissions の Bash glob は
 *   引数位置の制約に弱い（公式が "fragile" と明記）ため、ここで見る。
 * - このファイルは `.claude/**` にあるので ESLint 対象外・tsconfig 対象外。
 *   依存を持たない単一ファイルに保つこと。
 *
 * 実行形式は settings.json の exec form。`bash` は使わない — この開発機では
 * PATH 上の `bash` が `C:\WINDOWS\system32\bash.exe`（WSL ランチャ）に解決され、
 * Windows パスを渡すと壊れる。
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

function main() {
  const raw = readStdin();
  if (raw.trim() === "") return;

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // fail open
  }

  const command = input?.tool_input?.command;
  if (typeof command !== "string" || command === "") return;

  const hit = GUARDS.find((guard) => guard.pattern.test(command));
  if (hit === undefined) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: hit.reason,
      },
    }),
  );
}

main();
