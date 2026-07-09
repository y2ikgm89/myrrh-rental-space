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
 * 設計（全判定 deny。ask は不採用）:
 *   実地検証の結果、PreToolUse hook の permissionDecision: "ask" は
 *   permission_mode: "bypassPermissions"（--dangerously-skip-permissions 等）
 *   下では実際には確認プロンプトを出さず無視される（公式ドキュメント
 *   code.claude.com/docs/en/hooks-guide の "Hooks and permission modes" 節が
 *   明記するのは deny のみで、ask には一切言及がない）。使い捨てリポジトリで
 *   実際に git reset --hard をこのモード下で実行し、確認なしに即実行される
 *   ことを確認済み。deny は bypassPermissions でも確実にツール呼び出し自体を
 *   阻止し、reason 文言でモデルに再検討・ユーザー確認を促す
 *   （enforce-git-timeout.ts と同じパターン）。ユーザーが本当に必要な場合は
 *   ターミナルで直接実行すればよい。
 */

type HookInput = {
  tool_input?: { command?: string };
};

function deny(reason: string): never {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
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

// --- hook/署名バイパス機構 --------------------------------------------------
if (/--no-verify\b/.test(cmd)) {
  deny(
    "Git Safety Protocol: --no-verify は lefthook (pre-commit/pre-push) をスキップします。agent 経由では実行できません。ユーザー自身がターミナルで直接実行してください。",
  );
}
if (/LEFTHOOK=0/.test(cmd)) {
  deny(
    "lefthook.yml に記載の LEFTHOOK=0 による hook 全スキップです。agent 経由では実行できません。ユーザー自身がターミナルで直接実行してください。",
  );
}
if (
  /--no-gpg-sign\b/.test(cmd) ||
  /commit\.gpgsign=false/.test(cmd) ||
  /core\.hooksPath=/.test(cmd)
) {
  deny(
    "Git Safety Protocol: 署名/hooksPath のバイパスです。agent 経由では実行できません。ユーザー自身がターミナルで直接実行してください。",
  );
}

// --- main/master への force push --------------------------------------------
if (
  /\bgit\s+push\b/.test(cmd) &&
  /(--force\b|--force-with-lease\b|\s-f\b)/.test(cmd)
) {
  try {
    const branch = (await Bun.$`git branch --show-current`.text()).trim();
    if (branch === "main" || branch === "master") {
      deny("Git Safety Protocol: main/master への force push は禁止です。");
    }
  } catch {
    deny(
      "現在ブランチを確認できませんでした。force push は安全側に倒して禁止します。",
    );
  }
}

// --- 破壊的だが正当な場面もある操作 ------------------------------------------
if (/\bgit\s+reset\b[^|&;]*--hard\b/.test(cmd)) {
  deny(
    "CLAUDE.md 停止例外: git reset --hard は破壊的操作のため agent 経由では実行できません。必要な場合はユーザーに確認してください。",
  );
}
if (/\bgit\s+clean\b[^|&;]*-[a-zA-Z]*f/.test(cmd)) {
  deny(
    "CLAUDE.md 停止例外: git clean -f は破壊的操作のため agent 経由では実行できません。必要な場合はユーザーに確認してください。",
  );
}
if (/\bgit\s+branch\b[^|&;]*(-D\b|--delete\s+--force\b)/.test(cmd)) {
  deny(
    "CLAUDE.md 停止例外: git branch -D は破壊的操作のため agent 経由では実行できません。必要な場合はユーザーに確認してください。",
  );
}
if (/\bprisma\s+migrate\s+reset\b/.test(cmd) || /\bdb:reset\b/.test(cmd)) {
  deny(
    "CLAUDE.md 停止例外: prisma migrate reset (package.json の db:reset 経由も含む) はローカル DB を全消去するため agent 経由では実行できません。必要な場合はユーザーに確認してください。",
  );
}
if (/\bprisma\s+db\s+push\b/.test(cmd) || /\bdb:push\b/.test(cmd)) {
  deny(
    "prisma db push は migration 履歴を経由しない schema drift のため agent 経由では実行できません。原則 bun run db:migrate --name <name> を使ってください。",
  );
}
if (/\bprisma\s+db\s+pull\b/.test(cmd)) {
  deny(
    "prisma db pull は schema.prisma を DB 側の実体で上書きし未コミットの変更を失う可能性があるため agent 経由では実行できません。必要な場合はユーザーに確認してください。",
  );
}

process.exit(0);
