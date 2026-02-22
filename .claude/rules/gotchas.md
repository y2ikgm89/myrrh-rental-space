# Gotchas

プロジェクト固有の落とし穴と対処法。

## デプロイ

- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）

## TypeScript

- **`enum`・`namespace`・parameter properties 禁止**（`erasableSyntaxOnly: true`）— `const` + as const か union 型を使う → `.claude/rules/type-safety.md`
- **`import type` 必須**（`verbatimModuleSyntax: true`）— 値と型を同一インポートで混在させるとビルドエラー
- **`__tests__/` は type-check 対象外**（tsconfig exclude）— テスト内型エラーは `bun run type-check` では検出されず `bun test` 時のみ発覚

## ビルド・検証

- **`bun run build` は env チェックなし**（`SKIP_ENV_VALIDATION=true`）— 本番デプロイ前は `bun run build:strict`
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **`verification` エージェントはコードを自動修正する** — `bun run validate && bun run build` 実行時に型エラーを検出するとコードを自動変更することがある。検証のみなら Bash で `bun run validate` を直接実行

## ファイル操作・Git

- **`rm -rf` は deny ルール** — 追跡ファイルは `git rm -r <path>`、未追跡ファイルは `python3 -c "import shutil; shutil.rmtree('path')"` で削除
- **PostToolUse フック後は再 Read が必要** — Edit/Write 後に Prettier/ESLint フックがファイルを変更する。続けて同ファイルを Edit する場合は事前に再 Read しないと "file modified since read" エラー
- **`git add` 後はコミット前に `git status` 再確認** — Prettier PostToolUse フックが `git add` で他のステージング済みファイルも変更することがある（` M` に変わる）

## Claude Code 設定

- **`revise-claude-md` はセッション終了直前に呼ぶ** — CLAUDE.md はプロジェクトレベルのプロンプトキャッシュ層。セッション中に変更するとそれ以降のターンのキャッシュがすべて破壊される
- **MCP ツールはセッション開始前に確定させる** — セッション途中で `.mcp.json` を変更したり MCP サーバーを追加・削除するとツール定義のプレフィックスが変わりキャッシュが破壊される
- **新規 hook スクリプトは `bash` 明示呼び出し** — MINGW64 で `chmod` が Bash deny されるため、`settings.json` の `command` は `bash "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/script.sh"` 形式で記述する
- **hook スクリプトの `grep` + `pipefail` 罠** — `set -euo pipefail` 下で `var=$(cmd | grep pattern | head -1)` は grep 不一致（exit 1）でスクリプトが無音終了・stderr なし。根本解決: `if ! cmd | grep -qE 'pattern'; then exit 0; fi`（`if` 条件式内は `set -e` 対象外が Bash 仕様）

## Worktree

- **worktree で Prisma 生成ファイルが欠落** — `src/shared/generated/` は worktree に自動コピーされない。`bun run type-check` で "cannot find module" エラーが出る場合は `robocopy src/shared/generated .worktrees/<branch>/src/shared/generated /E /XF nul` で手動コピー（`/XF nul` で Windows `nul` デバイスファイルを除外）
- **worktree ブランチを main にローカルマージする際の注意（main に未コミット変更がある場合）**:
  1. `git stash` は untracked ファイルを含まない → stash 後も untracked ファイルが残りマージを阻む → 手動削除してから `git merge`
  2. `git stash pop` コンフリクト後 → 解決して `git add` → `git stash drop`（エントリは自動保持されたまま）
  3. worktree ディレクトリを削除済みでもブランチ参照が残る → `git worktree prune` → `git branch -d`

## Lexical エディタ

- **`createDOM` → data-attribute 変換後は `theme.ts` の旧エントリを削除** — `config.theme.*` 参照除去後、`theme.ts` に残った CSS クラスエントリが dead code になる。変換時にセットで削除する
- **NodeState `parse` には `config/type-guards.ts` の `parseString` / `parseBoolean` を使う** — inline lambda の重複は禁止（`lexical-patterns.md` 参照）

## errors モジュール（server-only 境界）

- **`@/shared/lib/errors` はクライアントセーフのみ** — `getErrorMessage`, `ErrorCategory`, `ErrorSeverity`, `normalizeError`, `ReservationOverlapError` のみ。Client Component から import 可能
- **`@/shared/lib/errors/server` はサーバー専用** — `logError`, `safeFetch`, `criticalFetch`, `createErrorLogger`。Client Component から import すると `server-only` ビルドエラー。上記クライアントセーフシンボルも全て re-export するので、サーバー側は `/server` に統一できる
- **バレルファイルに server-only と client-safe を混在させない** — `import "server-only"` を含むモジュールを re-export したバレルは丸ごと server-only 扱いになる（Client Component からは一切使用不可）

## React / コンポーネント

- **ダイアログを条件分岐の内側でレンダリング禁止** — early return や三項演算子の片側に `<Dialog>` / `<AlertDialog>` を置くと、他の状態から `open={true}` にしても表示されない。ダイアログはコンポーネント末尾のトップレベルで常にレンダリングする

## フレームワーク固有

- **`global-error.tsx` に `next/font/google` 使用不可** — admin.css/public.css をインポートしないため、変数モードのフォント CSS が preload されるが未使用警告になる。`<body style={{ fontFamily: '...' }}>` でシステムフォントを直接指定する
