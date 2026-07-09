#!/usr/bin/env bun
/**
 * PreToolUse / Edit|Write
 *
 * scripts/check-protected-files.sh (lefthook pre-commit) と同じ2ルールを
 * 「コミット時」ではなく「編集しようとした瞬間」に前倒しで強制する:
 *   - 既存の prisma/migrations/<id>/migration.sql の改変 → 絶対規約 #7 でハード禁止
 *     （新規 migration の追加は許可 — ファイルが存在しない = 新規追加）
 *   - .env* の編集（.example/.sample を除く）→ CLAUDE.md 停止例外。deny にする
 *
 * commit 時点まで待たずにここで止めることで、「編集→テスト→commit で初めて
 * lefthook に弾かれる」という手戻りを防ぐ。
 *
 * 全判定 deny（ask は不採用）: 実地検証の結果、PreToolUse hook の
 * permissionDecision: "ask" は permission_mode: "bypassPermissions" 下では
 * 確認プロンプトを出さず無視されることを確認した
 * （block-destructive-commands.ts のコメント参照）。
 */

type HookInput = {
  tool_input?: { file_path?: string };
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
const filePath = input.tool_input?.file_path ?? "";
if (!filePath) {
  process.exit(0);
}

// prefix (CLAUDE_PROJECT_DIR) との差分で相対パスを求める実装は、POSIX
// (Git Bash) 形式と Windows drive-letter 形式が混在すると一致判定に失敗する
// ことを実測で確認したため採用しない。絶対パスの「末尾一致」で判定する
// (両形式で安定して動くことをテスト済み)。
const normalized = filePath.replace(/\\/g, "/");

// 既存 migration.sql の改変
if (/\/prisma\/migrations\/[^/]+\/migration\.sql$/i.test(normalized)) {
  const exists = await Bun.file(filePath).exists();
  if (exists) {
    deny(
      "CLAUDE.md 絶対規約 #7: 既存の prisma/migrations/<id>/migration.sql は編集禁止です。schema.prisma を変更し `bun run db:migrate --name <name>` で新規 migration を生成してください。",
    );
  }
}

// .env*（.example / .sample を除く、basename で判定）
const basename = normalized.split("/").pop() ?? "";
const envMatch = /^\.env(\.[^.]+)?$/.test(basename);
const isExampleOrSample = /\.(example|sample)$/.test(basename);
if (envMatch && !isExampleOrSample) {
  deny(
    "CLAUDE.md 停止例外: .env* の編集(秘密値・新規 env 変数)は agent 経由では実行できません。ユーザー自身が編集するか、明示的な許可を得てください。",
  );
}

process.exit(0);
