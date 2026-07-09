#!/usr/bin/env bun
/**
 * PreToolUse / Bash
 *
 * memory/feedback_git-hook-timeout-budget.md:
 *   "git push/commit の tool timeout は300秒以上（pre-push が type-check+
 *   architecture-boundaries 直列で85秒超）"
 * CLAUDE.md 本文にも同じ規定がある（"タイムアウトを 180 秒以上（推奨 300 秒）
 * 確保する"）。これは繰り返し発生してきた自己判断ミスで、機械的に一発で
 * 潰せる部類。tool_input.timeout が閾値未満なら deny し、モデルに
 * timeout を上げて再実行させる（exit 2 / deny は公式ドキュメントで明確に
 * 定義された経路なので、ここでは確実性を優先して updatedInput による自動
 * 書き換えではなく deny+reason を採用している。updatedInput が Bash の
 * command 以外のフィールド、例えば timeout を安全にマージ/上書きできるかは
 * 公式ドキュメントに具体例がなく未確認のため、今回は使わない）。
 */

const MIN_TIMEOUT_MS = 300_000;

type HookInput = {
  tool_input?: { command?: string; timeout?: number };
};

const raw = await Bun.stdin.text();
const input = JSON.parse(raw) as HookInput;
const cmd = input.tool_input?.command ?? "";

// (\s|$) までを見て "commit" 単体に限定する。"git commit-tree" 等の
// plumbing コマンド（feedback_wip-isolation-git-plumbing.md で実際に使用）を
// \bgit\s+commit\b だけで判定すると誤って一致してしまうテスト不具合を実測で
// 確認したため、コマンド名の直後が空白 or 文字列終端であることも要求する。
if (!cmd || !/\bgit\s+(commit|push)(\s|$)/.test(cmd)) {
  process.exit(0);
}

const timeout = input.tool_input?.timeout ?? 0;

if (timeout < MIN_TIMEOUT_MS) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `feedback_git-hook-timeout-budget: git commit/push は pre-push hook (type-check → architecture-boundaries 直列、実測80〜110秒) を待つため timeout パラメータを${MIN_TIMEOUT_MS}ms(推奨) 以上、最低180000msに設定して再実行してください。現在値: ${timeout}ms`,
      },
    }),
  );
}

process.exit(0);
