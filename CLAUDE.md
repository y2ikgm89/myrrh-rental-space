# CLAUDE.md

> Myrrh Rental Space - レンタルスペース予約管理システム

## 🔴 必須（違反禁止）

### 禁止

- **型アサーション（`as`）禁止** → `.claude/rules/type-safety.md`
- **後方互換性ハック禁止** → 不要コード完全削除
- **検証なしの完了報告禁止** → 必ず検証コマンド実行
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認
- **ハードコードカラー禁止** → `gray-*`等禁止、テーマ変数使用 → `.claude/rules/tailwind-patterns.md`

### 検証（完了報告前に必須）

| タイミング    | コマンド                            |
| ------------- | ----------------------------------- |
| 作業中        | `bun run type-check`                |
| 完了報告前    | `bun run validate`                  |
| コミット/PR前 | `bun run validate && bun run build` |

### ルール

`.claude/rules/` の全 `.md` ファイルは自動ロード。`paths:` フロントマターで条件適用（対象ファイル編集時のみ）。

---

## 🟡 ワークフロー

> **セッション継続時**: `docs/plans/README.md` を確認して進行中タスクを把握

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

### スキル（自動発動）

| スキル                           | 発動タイミング                   |
| -------------------------------- | -------------------------------- |
| `brainstorming`                  | 機能追加・設計時                 |
| `frontend-design`                | フロントエンド UI 実装時         |
| `create-admin-page`              | 管理画面に新リソースを追加する時 |
| `create-server-action`           | Server Action を新規作成する時   |
| `test-driven-development`        | 実装時                           |
| `verification-before-completion` | 完了報告前（**常に必須**）       |
| `finishing-a-development-branch` | ブランチ完了時                   |

その他: `writing-plans`, `executing-plans`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review`

### ツール

- **コードベース調査**: `serena`（LSP ベース深い分析）、`codebase-explorer`（広範な探索）
- **専門エージェント**: `security-reviewer`、`project-reviewer`、`react-compiler-reviewer`、`animation-cleanup-reviewer`、`verification`、`design-memory`、`cache-strategy-reviewer`、`db-migration-reviewer`
- **MCP**: `serena`, `context7`, `playwright`, `github`（`.mcp.json` 設定済）
- **ui-ux-pro-max**: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> --stack nextjs`
  - ドメイン: `product`, `style`, `typography`, `color`, `landing`, `chart`, `ux`
- **ドキュメント更新**: `docs/plans/YYYY-MM-DD-title.md` → `docs/plans/README.md` → `docs/requirements/`（必要時）→ `docs/architecture/`（設計変更時）

### 手動スキル

`/superpowers:brainstorm`, `/superpowers:write-plan`, `/superpowers:execute-plan`, `/superpowers:using-git-worktrees`, `/frontend-design`, `/parallax-section`, `/prisma-migration`, `/create-admin-page`, `/create-server-action`, `/commit-commands:commit`, `/commit-commands:commit-push-pr`

---

## 🟢 プロジェクト情報

### 技術スタック

| 技術         | バージョン | 重要な注意点                                                  |
| ------------ | ---------- | ------------------------------------------------------------- |
| Next.js      | 16.1.6     | `'use cache'`, `updateTag`, PPR (`cacheComponents: true`)     |
| React        | 19.2.4     | React Compiler 1.0, `use()`, `useEffectEvent` (stable)        |
| TypeScript   | 6.0-beta   | `erasableSyntaxOnly`, `verbatimModuleSyntax` → type-safety.md |
| Prisma       | 7.4.0      | WASM エンジン, mapped enums（`as const` オブジェクト）        |
| Tailwind CSS | 4.1.18     | CSS-first, `@theme`, セマンティックカラートークン必須         |
| Zod          | 4.3.6      | `{ error: }` パラメータ（`message:` は非推奨）                |
| Better Auth  | 1.4.18     | RBAC, `withPermission` HOF 必須                               |
| Bun          | 1.3.x      | テストランナー (`bun:test`), `bunx --bun` でネイティブ実行    |

### 構造

**Multiple Root Layouts アーキテクチャ（Next.js 16 推奨パターン）**

```
src/app/
├── (admin)/admin/(dashboard)/   # 管理画面（URL: /admin/...）
│   ├── layout.tsx               # Admin Root Layout (html/body)
│   └── _shared/                 # 共有コンポーネント・アクション・lib
└── (public)/                    # 公開ページ
    ├── layout.tsx               # Public Root Layout (html/body)
    └── _shared/                 # 共有コンポーネント

src/shared/                      # 両方で共有（CSS変数非依存）
prisma/                          # schema.prisma, migrations/, seed.ts
```

| パス                                         | 用途                                   |
| -------------------------------------------- | -------------------------------------- |
| `src/app/(admin)/_styles/admin.css`          | 管理画面専用テーマ                     |
| `src/app/(public)/_styles/public.css`        | 公開ページテーマ                       |
| `src/app/(admin)/admin/(dashboard)/_shared/` | 管理画面専用コンポーネント             |
| `src/app/(public)/_shared/`                  | 公開ページ専用コンポーネント           |
| `src/app/(public)/[slug]/`                   | カスタムページルート（管理画面で作成） |
| `src/shared/`                                | 共有（CSS変数に依存しないコード）      |

**インポートエイリアス**: `@/admin/*`, `@/public/*`, `@/shared/*`

**管理画面パスの二重構造**: `src/app/(admin)/admin/(dashboard)/...` → URL は `/admin/...`

**公開ページ ↔ 管理画面の遷移はフルページリロード**（異なる Root Layout 間の仕様）

### コマンド

```bash
bun dev                                         # 開発サーバー
bun run test                                    # テスト
bun run test:all                                # Unit + Integration 並列テスト
bun run validate                                # type-check + lint 並列検証
bun run validate && bun run build               # 完全検証
bun run build:strict                            # 環境変数チェック有りビルド（本番確認用）
bunx --bun prisma migrate dev --name <name>     # マイグレーション
bun run db:generate                             # Prisma スキーマ再生成
bun run db:studio                               # Prisma Studio（DB GUI）
bun run e2e                                     # E2E テスト（Playwright）
gcloud builds submit --config=cloudbuild.yaml   # Cloud Run デプロイ（Cloud Build 経由）
```

> **自動フック**: Prettier + ESLint --fix（.ts/.tsx）/ schema-change-guard（schema.prisma）/ type-check-on-stop（TS 変更時の型チェック）
> **保護**: `.env*`, `bun.lockb`, `prisma/migrations/*.sql` は直接編集不可（PreToolUse フック）

### コーディング規約

- Server Components 優先、Server Actions
- Zod バリデーション必須
- 命名: コンポーネント `PascalCase.tsx`、その他 `kebab-case.ts`
- コミット: `<type>(<scope>): <subject>`

### ⚠️ Gotchas

- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）
- **`enum`・`namespace`・parameter properties 禁止**（`erasableSyntaxOnly: true`）— `const` + as const か union 型を使う → `.claude/rules/type-safety.md`
- **`import type` 必須**（`verbatimModuleSyntax: true`）— 値と型を同一インポートで混在させるとビルドエラー
- **`bun run build` は env チェックなし**（`SKIP_ENV_VALIDATION=true`）— 本番デプロイ前は `bun run build:strict`
- **`__tests__/` は type-check 対象外**（tsconfig exclude）— テスト内型エラーは `bun run type-check` では検出されず `bun test` 時のみ発覚
- **`rm -rf` は deny ルール** — 追跡ファイルは `git rm -r <path>`、未追跡ファイルは `python3 -c "import shutil; shutil.rmtree('path')"` で削除
- **`()` を含むパスは Bash コマンドで渡せない** — `src/app/(admin)/` 等は MINGW64 がサブシェル記法として解釈しエラー。Glob/Grep/Read ツールを使うかクォートで回避（例: `ls 'src/app/(admin)/'`）
- **PostToolUse フック後は再 Read が必要** — Edit/Write 後に Prettier/ESLint フックがファイルを変更する。続けて同ファイルを Edit する場合は事前に再 Read しないと "file modified since read" エラー
- **`verification` エージェントはコードを自動修正する** — `bun run validate && bun run build` 実行時に型エラーを検出するとコードを自動変更することがある。検証のみなら Bash で `bun run validate` を直接実行
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **新規 hook スクリプトは `bash` 明示呼び出し** — MINGW64 で `chmod` が Bash deny されるため、`settings.json` の `command` は `bash "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/script.sh"` 形式で記述する
- **`git add` 後はコミット前に `git status` 再確認** — Prettier PostToolUse フックが `git add` で他のステージング済みファイルも変更することがある（` M` に変わる）
