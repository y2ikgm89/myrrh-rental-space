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

### スキル

Skill ツールで明示的に呼び出す。1% でも該当する可能性があれば必ず呼び出すこと。`（Task）` 注釈があるもののみ Task ツール経由、それ以外は全て Skill ツール。

**常時（ワークフロー）**

| スキル                           | 呼び出しタイミング                                 |
| -------------------------------- | -------------------------------------------------- |
| `brainstorming`                  | 機能追加・設計時                                   |
| `writing-plans`                  | 複数ステップのタスク計画時                         |
| `subagent-driven-development`    | 計画を同一セッション内でサブエージェント実行する時 |
| `test-driven-development`        | 実装時（**常に必須**）                             |
| `verification-before-completion` | 完了報告前（**常に必須**）                         |
| `finishing-a-development-branch` | ブランチ完了時                                     |

**機能追加（ドメイン別）**

| スキル                                                | 呼び出しタイミング                                |
| ----------------------------------------------------- | ------------------------------------------------- |
| `frontend-design`                                     | フロントエンド UI 実装時                          |
| `create-admin-page`                                   | 管理画面に新リソースを追加する時                  |
| `create-server-action`                                | Server Action を新規作成する時                    |
| `create-page-content`                                 | 公開ページ追加時（スキーマ+デフォルト+seed+page） |
| `add-settings-field`                                  | Settings シングルトンにフィールド追加する時       |
| `prisma-migration`                                    | DBスキーマ変更時                                  |
| `new-section`                                         | `[...segments]` カスタムページ用セクション追加時  |
| `lexical-node` / `lexical-plugin` / `lexical-toolbar` | Lexical 拡張追加時                                |
| `split-action-file`                                   | 500行超の Server Action ファイル分割時            |

**問題対応・メンテ**

| スキル                                    | 呼び出しタイミング                         |
| ----------------------------------------- | ------------------------------------------ |
| `systematic-debugging`                    | バグ・テスト失敗時                         |
| `requesting-code-review`                  | 実装完了・PR 前                            |
| `receiving-code-review`                   | レビュー受け取り時                         |
| `stripe-debug`                            | Stripe 問題発生時                          |
| `google-calendar-debug`                   | カレンダー同期問題時                       |
| `turbopack-hmr`                           | Turbopack HMR エラー時                     |
| `claude-md-management:claude-md-improver` | CLAUDE.md・rules・agents の定期メンテ時    |
| `claude-md-management:revise-claude-md`   | セッション終了時の学びを CLAUDE.md に記録  |
| `code-simplifier:code-simplifier`（Task） | コードリファクタリング・重複排除・最適化時 |

### ツール

- **コードベース調査**: `serena`（LSP ベース）、`codebase-explorer`（広範な探索）
- **専門エージェント（Task ツール — proactive 呼び出し推奨）**: `.claude/agents/` 参照
  - `security-reviewer`: auth・Stripe・OAuth・API Route・外部連携コード変更後
  - `project-reviewer`: 管理画面コード作成・大規模リファクタリング後（型安全・カラートークン・rules 違反）
  - `cache-strategy-reviewer`: `updateTag`・`revalidateTag`・`'use cache'` 関数変更後
  - `lexical-reviewer`: `src/**/lexical/` 配下 Node/Plugin 編集後（`nodes.ts` の Node Replacement 設定変更も含む）
  - `react-compiler-reviewer`: GSAP/Lenis/Lexical を含むコンポーネント編集後（Rules of React 違反検出）
  - `accessibility-reviewer`: 管理画面フォーム・ダイアログ・テーブル・ナビゲーション編集後（WCAG 2.1 AA）
  - `animation-cleanup-reviewer`: GSAP/Lenis を含むコンポーネント編集後（メモリリーク検出）
  - `performance-analyzer`: 新規ページ・コンポーネント追加後（バンドルサイズ・First Load JS 分析）
  - `test-writer`: 新規 lib 関数・Server Action・バリデーションスキーマ実装後
  - `test-runner`: テスト失敗時の root cause 分析・修正（特定テストの隔離実行）
  - `e2e-test-writer`: 新規管理画面ページ・公開ページ・認証フロー実装後（Playwright E2E）
  - `db-migration-reviewer`: `bunx --bun prisma migrate dev` 実行前
  - `large-file-detector`: 500行超アクションファイルの定期チェック・分割候補の洗い出し
  - `route-structure-reviewer`: ルート追加・移行後の構造整合性チェック（Suspense boundary・空ディレクトリ・html/body 漏れ）
- **プロジェクト MCP** (`github`): `.mcp.json` 設定済 — PR・Issue・ブランチ操作
- **グローバル Plugin/MCP** (`serena`, `context7`, `playwright`): ユーザーレベルで設定済
  - `context7`: ライブラリ公式ドキュメント参照時 — `resolve-library-id` → `query-docs`（対象: Lexical / React 19 / Next.js 16 / Prisma 7 / Zod 4 / Better Auth）
  - `playwright`: UI 実装後の視覚確認・E2E デバッグ（`browser_navigate` → `browser_take_screenshot`）
- **ui-ux-pro-max**: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> --stack nextjs`
- **ドキュメント更新**: `docs/plans/YYYY-MM-DD-title.md` → `docs/plans/README.md`
- **スペック/計画**: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` / `docs/superpowers/plans/YYYY-MM-DD-<name>.md`

---

## 🟢 プロジェクト情報

### 技術スタック

| 技術         | バージョン | 重要な注意点                                                  |
| ------------ | ---------- | ------------------------------------------------------------- |
| Next.js      | 16.1.6     | `'use cache'`, `updateTag`, PPR (`cacheComponents: true`)     |
| React        | 19.2.4     | React Compiler 1.0, `use()`, `useEffectEvent` (stable)        |
| TypeScript   | 6.0.1-rc   | `erasableSyntaxOnly`, `verbatimModuleSyntax` → type-safety.md |
| Prisma       | 7.5.0      | WASM エンジン, mapped enums（`as const` オブジェクト）        |
| Tailwind CSS | 4.2.1      | CSS-first, `@theme`, セマンティックカラートークン必須         |
| Zod          | 4.3.6      | `{ error: }` パラメータ（`message:` は非推奨）                |
| Better Auth  | 1.5.5      | RBAC, `executeAdminMutationResult` パターン必須               |
| Bun          | 1.3.10     | テストランナー (`bun:test`), `bunx --bun` でネイティブ実行    |

### 構造

**Multiple Root Layouts アーキテクチャ（Next.js 16 推奨パターン）**

```
src/app/
├── (admin)/admin/(dashboard)/   # 管理画面（URL: /admin/...）
│   ├── layout.tsx               # Admin Root Layout (html/body)
│   └── _shared/                 # 共有コンポーネント・アクション・lib
└── (public)/                    # 公開ページ（Page-First Architecture）
    ├── layout.tsx               # Public Root Layout (html/body, LenisProvider, MobileNav)
    ├── _shared/
    │   ├── components/
    │   │   ├── design-system/   # Primitives (Button, Card, Heading 等 11種)
    │   │   ├── layouts/         # site-header, site-footer, page-hero, site-cta, breadcrumb, mobile-nav
    │   │   ├── ui/              # image-gallery, filter-bar, share-buttons, step-indicator
    │   │   └── animations/      # scroll-reveal, fade-in, split-text, parallax-layer, magnetic-button
    │   └── lib/content/         # PageContent 型・スキーマ・クエリ・デフォルト値
    ├── _components/homepage/    # ホームページ専用コンポーネント
    └── spaces/[slug]/           # スペース詳細（Page-First）

src/shared/                      # 両方で共有（CSS変数非依存）
  ├── domain/page-content/       # PageContent キャッシュ付きクエリ
  └── domain/spaces/             # 公開スペースクエリ (public-queries.ts)
prisma/                          # schema.prisma, migrations/, seed.ts
```

| パス                                         | 用途                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `src/app/(admin)/_styles/admin.css`          | 管理画面専用テーマ                                |
| `src/app/(public)/_styles/public.css`        | 公開ページテーマ（Deep Neutral + Warm Accent）    |
| `src/app/(admin)/admin/(dashboard)/_shared/` | 管理画面専用コンポーネント                        |
| `src/app/(public)/_shared/`                  | 公開ページ Design System + Layout                 |
| `src/app/(public)/[...segments]/`            | カスタムページ + ポスト詳細（セクション方式維持） |
| `src/app/(public)/spaces/[slug]/`            | スペース詳細（Page-First）                        |
| `src/shared/`                                | 共有（CSS変数に依存しないコード）                 |

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
bun upgrade                                     # Bun ランタイム自体のアップグレード
bun outdated                                    # 依存パッケージの最新版確認
bun update                                      # semver 範囲内の依存パッケージ一括更新
```

> **自動フック**: Prettier + ESLint --fix（.ts/.tsx）/ schema-change-guard（schema.prisma）/ type-check-on-stop（Stop イベント毎に型チェック実行）
> **保護**: `.env*`, `bun.lock`, `prisma/migrations/*.sql` は直接編集不可（PreToolUse フック）

### コーディング規約

- Server Components 優先、Server Actions
- Zod バリデーション必須
- フォーム送信ボタン: `<SubmitButton isPending={isPending} label="保存" />` — `@/admin/components/ui`（インライン `isPending ? "X中..." : "X"` パターン禁止）
- 命名: 管理画面コンポーネント `PascalCase.tsx`、公開ページコンポーネント `kebab-case.tsx`、その他 `kebab-case.ts`
- 公開ページ: Page-First Architecture — ページ構成はコードで直接定義、`SectionRenderer` は `[...segments]` のみ
- 公開ページコンテンツ: `getPageContent(pageKey, schema, default)` で DB から取得（`'use cache'` + `cacheTag`）
- 公開ページフォーム: `Input`/`Select`/`Textarea` は `_shared/components/design-system/` から使用
- コミット: `<type>(<scope>): <subject>`

### ⚠️ Gotchas

→ `.claude/rules/gotchas.md`（自動ロード済み）
