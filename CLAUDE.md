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

### 詳細ルール

ルールは `.claude/rules/` ディレクトリで管理。Claude Code が自動ロード（再帰的）:

| ディレクトリ                  | ロード条件                | 内容                                              |
| ----------------------------- | ------------------------- | ------------------------------------------------- |
| `.claude/rules/*.md`          | **常時**                  | 型安全・実装品質・Server Actions 等（全作業共通） |
| `.claude/rules/frontend/*.md` | `src/app/**` 作業時       | UI・アニメーション・アクセシビリティ・SEO 等      |
| `.claude/rules/ops/*.md`      | **`Dockerfile` 等作業時** | Docker / Cloud Run / Cloud Build                  |

> 詳細リファレンス: `docs/reference/claude-rules/` に配置（必要時に参照）

---

## 🟡 ワークフロー

**superpowersが自動発動** — 特別な操作不要

> **セッション継続時**: `docs/plans/README.md` を確認して進行中タスクを把握

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
                  ↑ 全工程でsuperpowersが自動介入
```

### 自動発動スキル（主要）

| スキル                           | 発動タイミング             |
| -------------------------------- | -------------------------- |
| `brainstorming`                  | 機能追加・設計時           |
| `frontend-design`                | フロントエンドUI実装時     |
| `test-driven-development`        | 実装時                     |
| `verification-before-completion` | 完了報告前（**常に必須**） |
| `finishing-a-development-branch` | ブランチ完了時             |

> 他: `writing-plans`, `executing-plans`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review` も自動発動

### ツール使い分け

- **コードベース調査**: `serena`（LSPベース深い分析）, `codebase-explorer`（広範な探索）
- **専門エージェント**:
  - `security-reviewer` — auth/Stripe/OAuth/暗号化コードのセキュリティレビュー
  - `project-reviewer` — 実装完了後の総合品質チェック（型安全・カラートークン・規約）
  - `verification` — type-check / lint / build の検証（Haiku 使用で高速）
  - `design-memory` — ブランドデザイン決定の記憶（UI実装時）
- **MCP**: `serena`, `context7`, `playwright`, `github`（`.mcp.json`設定済、`github-mcp-server`バイナリ要`GITHUB_PERSONAL_ACCESS_TOKEN`環境変数）推奨。`WebSearch`, `WebFetch` 必要時
- **ui-ux-pro-max**: `py .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> --stack nextjs`
  - ドメイン: `product`, `style`, `typography`, `color`, `landing`, `chart`, `ux`
- **ドキュメント更新**: `docs/plans/NNN-title.md` → `docs/plans/README.md` → `docs/requirements/`（必要時） → `docs/architecture/`（設計変更時）

### 手動コマンド（必要時のみ）

`/superpowers:brainstorm`, `/superpowers:write-plan`, `/superpowers:execute-plan`, `/superpowers:using-git-worktrees`, `/ui-ux-pro-max`, `/frontend-design`, `/parallax-section`, `codebase-explorer`, `/prisma-migration`

---

## 🟢 プロジェクト情報

### 技術スタック

| 技術         | バージョン | 備考                                                 |
| ------------ | ---------- | ---------------------------------------------------- |
| Next.js      | 16.1.6     | `'use cache'`, `updateTag`, PPR対応                  |
| React        | 19.2.4     | React Compiler 1.0, `<Activity>`, `useEffectEvent`   |
| TypeScript   | 6.0-beta   | TS 7.0 準備用 `--stableTypeOrdering` 利用可          |
| Bun          | 1.3.x      | Bun.SQL, HTML直接実行                                |
| Prisma       | 7.4.0      | 型生成98%削減, mapped enums                          |
| PostgreSQL   | -          | Supabase経由                                         |
| Better Auth  | 1.4.18     | RBAC, Auth.js統合                                    |
| Tailwind CSS | 4.1.18     | CSS-first設定, @theme                                |
| Zod          | 4.3.6      | `{ error: }` パラメータ, z.fromJSONSchema()          |
| nuqs         | 2.8.8      | createSearchParamsCache, Zod 4統合                   |
| Lexical      | 0.40.0     | React 19対応, Node transforms, mergeRegister本体移動 |
| GSAP         | 3.14.2     | ScrollTrigger, @gsap/react 2.1                       |
| Three.js     | 0.182.0    | @react-three/fiber 9.5, @react-three/drei 10.7       |
| PixiJS       | 8.16.0     | 2D WebGLレンダラー                                   |
| Lenis        | 1.3.17     | スムーススクロール                                   |

### 構造

**Multiple Root Layouts アーキテクチャ（Next.js 16 推奨パターン）**

```
prisma/
├── schema.prisma                         # DB スキーマ定義
├── better-auth-schema.prisma             # Better Auth テーブル定義
├── migrations/                           # マイグレーション履歴
└── seed.ts                               # 初期データ投入

src/
├── app/
│   ├── api/                              # API Routes（admin/auth/cron/ical/instagram/webhooks）
│   ├── (admin)/                          # 管理画面ルートグループ
│   │   ├── layout.tsx                    # Admin Root Layout (html/body)
│   │   ├── _styles/admin.css             # 管理画面専用テーマ（固定）
│   │   └── admin/(dashboard)/_shared/    # 管理画面共有コンポーネント
│   │
│   └── (public)/                         # 公開ページルートグループ
│       ├── layout.tsx                    # Public Root Layout (html/body)
│       ├── _styles/public.css            # 公開ページテーマ（AI生成対象）
│       ├── [slug]/page.tsx               # セクションベースページ（統一ルート）
│       └── _shared/                      # 公開ページ共有コンポーネント
│
└── shared/                               # 両方で共有（CSS変数非依存）
```

| パス                                         | 用途                                   |
| -------------------------------------------- | -------------------------------------- |
| `src/app/(admin)/_styles/admin.css`          | 管理画面専用テーマ                     |
| `src/app/(public)/_styles/public.css`        | 公開ページテーマ                       |
| `src/app/(admin)/admin/(dashboard)/_shared/` | 管理画面専用コンポーネント             |
| `src/app/(public)/_shared/`                  | 公開ページ専用コンポーネント           |
| `src/app/(public)/[slug]/`                   | カスタムページルート（管理画面で作成） |
| `src/app/(public-*)/`                        | 追加の公開ページルートグループ         |
| `src/shared/`                                | 共有（CSS変数に依存しないコード）      |
| `docs/{requirements,architecture,plans}/`    | ドキュメント                           |

**公開ページURL構造**:

- `/` - ホームページ
- `/faq`, `/about`, `/contact`, `/spaces`, `/reservation`, `/privacy`, `/terms` - 専用ページ
- `/news`, `/news/[slug]` - ニュース
- `/posts`, `/posts/[slug]` - ブログ
- `/spaces/[slug]` - スペース詳細
- `/[slug]` - カスタムページ（DBで管理）

**注意**: 公開ページ ↔ 管理画面の遷移はフルページリロード（異なるRoot Layout間の仕様）

**管理画面パスの二重構造**: `src/app/(admin)/admin/(dashboard)/...` → URL は `/admin/...`

- `(admin)` = ルートグループ（URL不変）、`admin` = URLセグメント、`(dashboard)` = ルートグループ（URL不変）

**API Routes**: `src/app/api/` 配下（`admin/`, `auth/`, `cron/`, `health/`, `ical/`, `instagram/`, `webhooks/`）

### エイリアス

`@/admin/*`, `@/public/*`, `@/shared/*`

### コマンド

```bash
bun dev                    # 開発サーバー
bun run test               # テスト
bun run test:all           # Unit + Integration 並列テスト
bun run validate           # type-check + lint 並列検証
bun run validate && bun run build  # 完全検証
bun run build:strict               # 環境変数チェック有りビルド（本番確認用）
bunx --bun prisma migrate dev --name <name>  # マイグレーション
bun run db:generate        # Prismaスキーマ再生成
bun run db:studio          # Prisma Studio（DB GUI）
bun run e2e                # E2Eテスト（Playwright）
bun run format             # Prettier フォーマット（Edit/Write 後は hook で自動実行）
gcloud builds submit --config=cloudbuild.yaml  # Cloud Run デプロイ（Cloud Build経由）
```

> **自動フック**: Prettier + ESLint --fix（.ts/.tsx）/ schema-change-guard（schema.prisma）
> **保護**: `.env*`, `bun.lockb`, `prisma/migrations/*.sql` は直接編集不可（PreToolUse フック）

### コーディング規約

- Server Components優先、Server Actions
- Zodバリデーション必須
- 命名: コンポーネント`PascalCase.tsx`、その他`kebab-case.ts`
- コミット: `<type>(<scope>): <subject>`

### ⚠️ Gotchas

- **デプロイ先は Google Cloud Run**（Vercel ではない）— `Dockerfile` + `cloudbuild.yaml` が設定ファイル。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run サービスに明示設定する（`VERCEL_URL` は存在しない）
- **`enum`・`namespace`・parameter properties 禁止（コンパイラレベル）** — `erasableSyntaxOnly: true`（tsconfig）。`const enum` か union型を使う
- **型インポートは `import type` 必須** — `verbatimModuleSyntax: true`。値と型を同一インポートで混在させるとビルドエラー
- **`bun run build` は env チェックなし** — `SKIP_ENV_VALIDATION=true` が付く。本番デプロイ前は `bun run build:strict`
- **`__tests__/` は type-check 対象外** — tsconfig の exclude 指定。テスト内型エラーは `bun run type-check` では検出されず `bun test` 時のみ発覚
- **インデックスシグネチャはブラケット記法強制** — `noPropertyAccessFromIndexSignature: true`。`obj.key` ではなく `obj['key']`
- **`rm -rf` は deny ルール** — 追跡ファイルは `git rm -r <path>`、未追跡ファイル/ディレクトリは `py -c "import shutil; shutil.rmtree('path')"` で削除
- **gitignore 追加後の既存追跡ファイル** — `git rm --cached -r <path>` でインデックスから除外（ファイルはディスクに残る）
- **`()` を含むパスは Bash コマンドで渡せない** — `src/app/(admin)/` など Next.js ルートグループパスを Bash に渡すと MINGW64 が `(` をサブシェル記法として解釈しエラー。Glob/Grep/Read ツールを使うか、クォートで回避（例: `ls 'src/app/(admin)/'`）
- **Prettier がマークダウン表の `**`を`\*\*`にエスケープする** — テーブルセル内の`**bold**`は Prettier フォーマット後に`\*\*bold\*\*` へ自動変換される。設定で抑制不可。解決策はボールド書式を削除すること。
- **PostToolUse フック後は再 Read が必要** — Edit/Write 後に Prettier/ESLint フックが走るとファイルが変更される。続けて同ファイルを Edit する場合は事前に再 Read しないと "file modified since read" エラーが発生する。
