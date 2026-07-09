#!/usr/bin/env bun
/**
 * PreToolUse / Bash
 *
 * CLAUDE.md の自動完遂ポリシーは「destructive 操作（reset --hard / migrate
 * reset / --no-verify / hook bypass / branch -D）」を停止例外として列挙して
 * いるが、これまでは "ツール呼び出しレベルの deny hook はプロジェクト側に
 * 現存しないため、これと上記 gate・停止例外自体が最終防衛線" と明記されて
 * いた通り、モデルが自己判断で従うことだけが防波堤だった。このスクリプトは
 * その一部を機械的に強制する。
 *
 * 設計:
 *   - hook バイパス機構（--no-verify / LEFTHOOK=0 / --no-gpg-sign 等）は
 *     ask にする（deny にしない）。理由: ユーザーの global CLAUDE.md の
 *     Git Safety Protocol は "NEVER skip hooks ... unless the user
 *     explicitly requests it" — ユーザーが明示的に要求した場合は許容される
 *     余地があり、PreToolUse hook は「その turn がユーザーの明示指示に
 *     基づくか」を判別できない。deny で一律ブロックすると正当なユーザー
 *     指示まで機械的に潰してしまうため、実際の許可ダイアログ(ask)で
 *     ユーザー自身に判断させる。
 *   - main/master への force push のみ deny を維持する。
 *     CLAUDE.md の Git Safety Protocol は "NEVER force push to main/master"
 *     と例外なく禁止しており、ask による中断より、そもそも agent 経由では
 *     実行させない方が既存ポリシーに忠実（必要ならユーザーがターミナルで
 *     直接実行すればよい）。
 *   - 「破壊的だが正当な場面もある」操作（reset --hard, clean -f, branch -D,
 *     migrate reset, db push/pull）は ask にして、実際の許可ダイアログで
 *     ユーザーに確認させる（CLAUDE.md の「該当すれば停止」＝ユーザー確認、を
 *     そのまま permission prompt にマッピング）。
 */

type HookInput = {
  tool_input?: { command?: string };
};

function decide(permissionDecision: "deny" | "ask", reason: string): never {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

const raw = await Bun.stdin.text();
const input = JSON.parse(raw) as HookInput;
const cmd = input.tool_input?.command ?? "";

if (!cmd) {
  process.exit(0);
}

// --- hook/署名バイパス機構: ユーザー確認を必須化 (ask) ----------------------
if (/--no-verify\b/.test(cmd)) {
  decide(
    "ask",
    "Git Safety Protocol: --no-verify は lefthook (pre-commit/pre-push) をスキップします。ユーザーの明示的な許可が必要です。",
  );
}
if (/LEFTHOOK=0/.test(cmd)) {
  decide(
    "ask",
    "lefthook.yml に記載の LEFTHOOK=0 による hook 全スキップです。ユーザーの明示的な許可が必要です。",
  );
}
if (
  /--no-gpg-sign\b/.test(cmd) ||
  /commit\.gpgsign=false/.test(cmd) ||
  /core\.hooksPath=/.test(cmd)
) {
  decide(
    "ask",
    "Git Safety Protocol: 署名/hooksPath のバイパスです。ユーザーの明示的な許可が必要です。",
  );
}

// --- main/master への force push（例外なく禁止のため deny を維持） ---------
if (
  /\bgit\s+push\b/.test(cmd) &&
  /(--force\b|--force-with-lease\b|\s-f\b)/.test(cmd)
) {
  try {
    const branch = (await Bun.$`git branch --show-current`.text()).trim();
    if (branch === "main" || branch === "master") {
      decide(
        "deny",
        "Git Safety Protocol: main/master への force push は禁止です。",
      );
    }
  } catch {
    decide(
      "ask",
      "現在ブランチを確認できませんでした。force push の実行前にユーザー確認が必要です。",
    );
  }
}

// --- 破壊的だが正当な場合もある操作: 停止してユーザーに確認 -----------------
if (/\bgit\s+reset\b[^|&;]*--hard\b/.test(cmd)) {
  decide(
    "ask",
    "CLAUDE.md 停止例外: git reset --hard は破壊的操作です。実行前にユーザー確認が必要です。",
  );
}
if (/\bgit\s+clean\b[^|&;]*-[a-zA-Z]*f/.test(cmd)) {
  decide(
    "ask",
    "CLAUDE.md 停止例外: git clean -f は破壊的操作です。実行前にユーザー確認が必要です。",
  );
}
if (/\bgit\s+branch\b[^|&;]*(-D\b|--delete\s+--force\b)/.test(cmd)) {
  decide(
    "ask",
    "CLAUDE.md 停止例外: git branch -D は破壊的操作です。実行前にユーザー確認が必要です。",
  );
}
if (/\bprisma\s+migrate\s+reset\b/.test(cmd) || /\bdb:reset\b/.test(cmd)) {
  decide(
    "ask",
    "CLAUDE.md 停止例外: prisma migrate reset (package.json の db:reset 経由も含む) はローカル DB を全消去します。実行前にユーザー確認が必要です。",
  );
}
if (/\bprisma\s+db\s+push\b/.test(cmd) || /\bdb:push\b/.test(cmd)) {
  decide(
    "ask",
    "prisma db push は migration 履歴を経由しない schema drift です。原則 bun run db:migrate --name <name> を使ってください。実行するにはユーザー確認が必要です。",
  );
}
if (/\bprisma\s+db\s+pull\b/.test(cmd)) {
  decide(
    "ask",
    "prisma db pull は schema.prisma を DB 側の実体で上書きし、未コミットの schema 変更を失う可能性があります。実行前にユーザー確認が必要です。",
  );
}

process.exit(0);
