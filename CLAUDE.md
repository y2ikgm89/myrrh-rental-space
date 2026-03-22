# CLAUDE.md

> Myrrh Rental Space - レンタルスペース予約管理システム

**併読**: `AGENTS.md`（不変条件）、`.claude/rules/`（自動ロード）、`docs/architecture/agent-instructions.md`（指示配置）

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

**スキル手順の正本**: 繰り返しワークフローは **`.agents/skills/<name>/`** のみに本文・`scripts/`・`data/` を置く。`.claude/skills/<name>/SKILL.md` は **スタブ**（正本へのポインタ）にとどめ、重複コピーを増やさない（`docs/architecture/agent-instructions.md`）。

**Codex との二重管理**: 同トピックが `docs/reference/codex-rules/` にもある場合（ビジュアルエフェクト、Three.js、PixiJS、`bun-patterns` 相当の記述など）、**方針と公式リンクは同一に保つ**。削除済みパス（旧 `effects/`）や未依存パッケージの記述を片方だけに残さない。

---

## 🟡 ワークフロー

> **セッション継続時**: `docs/plans/README.md` を確認して進行中タスクを把握

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

### スキル

Skill ツールで明示的に呼び出す。1% でも該当する可能性があれば必ず呼び出すこと。`（Task）` 注釈があるもののみ Task ツール経由、それ以外は全て Skill ツール。

リポジトリ定義スキルは **`.agents/skills/<name>/SKILL.md` が手順の正本**；**`.claude/skills/<name>/SKILL.md` はスタブ**（正本パスへのポインタ）。一覧・作成基準は `.agents/skills/README.md`。

- **常に必須**: `test-driven-development`（実装時）、`verification-before-completion`（完了報告前）
- **設計・計画**: `brainstorming` → `writing-plans` → `subagent-driven-development` / `finishing-a-development-branch`
- **UI 実装**: `frontend-design`、`create-admin-page`、`create-page-content`、`create-server-action`
- **スキーマ・設定**: `add-settings-field`、`prisma-migration`、`split-action-file`、`upgrade-deps`
- **エディタ拡張**: `lexical-node` / `lexical-plugin` / `lexical-toolbar`（長いひな形は `reference/scaffold-*.md`）、`lexical-audit`（既存実装の監査・モダナイズ）
- **公開ページ演出**: `parallax-section`（スクロール連動セクション、GSAP + reduced motion）
- **問題対応**: `systematic-debugging`、`stripe-debug`、`google-calendar-debug`、`turbopack-hmr`
- **レビュー・メンテ**: `requesting-code-review`、`receiving-code-review`、`audit-settings-sections`、`claude-md-management:claude-md-improver`、`claude-md-management:revise-claude-md`
- **リファクタリング**: `code-simplifier:code-simplifier`（Task）

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
- **ui-ux-pro-max**: Unix は `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> --stack nextjs`、Windows は `py -3` を `python3` の代わりに使う（`.claude/skills/ui-ux-pro-max` はスタブ）
- **ドキュメント更新**: `docs/plans/YYYY-MM-DD-title.md` → `docs/plans/README.md`
- **スペック/計画**: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` / `docs/superpowers/plans/YYYY-MM-DD-<name>.md`

---

## 🟢 プロジェクト情報

### 技術スタック

| 技術         | バージョン | 重要な注意点                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js      | 16.2.1     | `'use cache'`, `updateTag`, PPR (`cacheComponents: true`)                                                                                                                                                                                                                                                                                           |
| React        | 19.2.4     | React Compiler 1.0, `use()`, `useEffectEvent` (stable)                                                                                                                                                                                                                                                                                              |
| TypeScript   | 6.0.1-rc   | `erasableSyntaxOnly`, `verbatimModuleSyntax` → type-safety.md                                                                                                                                                                                                                                                                                       |
| Prisma       | 7.5.0      | WASM エンジン, mapped enums。`$extends`（Decimal→number 等）は **`createAppPrismaClient`**（`src/shared/db/create-app-prisma-client.ts`）に集約し、`prisma.ts` と **`prisma/seed.ts` で同一適用**（[Client extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions)）。`prismaAdapter` には拡張前 **`prismaForBetterAuth` のみ** |
| Tailwind CSS | 4.2.1      | CSS-first, `@theme`, セマンティックカラートークン必須                                                                                                                                                                                                                                                                                               |
| Zod          | 4.3.6      | `{ error: }` パラメータ（`message:` は非推奨）                                                                                                                                                                                                                                                                                                      |
| Better Auth  | 1.5.5      | RBAC, `executeAdminMutationResult` 必須。**Prisma**: `prismaAdapter(prismaForBetterAuth)` + `advanced.database.generateId: "uuid"`（[公式](https://www.better-auth.com/docs/concepts/database)）+ `baseURL` 明示設定。動的 `getAuth()` は禁止                                                                                                       |
| Bun          | 1.3.11     | テストランナー (`bun:test`), `bunx --bun` でネイティブ実行（`package.json` の `packageManager` と一致）                                                                                                                                                                                                                                             |
| jsdom（dev） | ^28.x      | ユニットテスト用 DOM（`__tests__/setup-dom.ts`）。[`@lexical/html` headless は DOM が必要](https://lexical.dev/docs/packages/lexical-html)                                                                                                                                                                                                          |

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
    │   ├── actions/             # 公開フォーム Server Actions（認証不要、Turnstile保護）
    │   ├── hooks/               # usePublicForm 等
    │   ├── components/
    │   │   ├── design-system/   # Primitives 10（直接 import のみ・barrel 禁止）: badge, button, container, heading, image-frame, input, prose, select, stack, textarea
    │   │   ├── layouts/         # site-header, site-footer, page-hero, site-cta, breadcrumb, mobile-nav 等
    │   │   ├── ui/              # image-gallery, filter-bar, share-buttons, step-indicator, section-label
    │   │   └── animations/      # scroll-reveal, fade-in, split-text, parallax-layer, parallax-image, magnetic-button
    │   └── lib/content/         # PageContent 型・スキーマ・クエリ・デフォルト値
    ├── _components/homepage/    # ホームページ専用コンポーネント
    └── spaces/[slug]/           # スペース詳細（Page-First）

src/shared/                      # 両方で共有（CSS変数非依存）
  ├── domain/page-content/       # PageContent キャッシュ付きクエリ
  └── domain/spaces/             # 公開スペースクエリ (public-queries.ts)
prisma/                          # schema.prisma, migrations/, seed.ts
```

| パス（ツリー図に無いもの）                           | 用途                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/app/(admin)/_styles/admin.css`                  | 管理画面専用テーマ                                                       |
| `src/app/(public)/_styles/public.css`                | 公開ページテーマ（Deep Neutral + Warm Accent）                           |
| `src/shared/db/create-app-prisma-client.ts`          | Prisma `$extends` の単一実装・`AppPrismaClient` 型                       |
| `src/shared/lib/errors/logger-core.ts`               | 構造化ログ（seed / `server-only` 外モジュール用）                        |
| `src/shared/lib/email/`                              | メール送信（types/send/reservation-emails/contact-emails/system-emails） |
| `src/shared/lib/calendar-sync/`                      | カレンダー同期（types/outbound/inbound）                                 |
| `src/shared/lib/pricing/`                            | 料金計算（types/discount/tax/format/reservation）                        |
| `src/shared/domain/settings/queries/`                | 設定クエリ（site/organization/notification/display）                     |
| `src/shared/domain/settings/integration-commands.ts` | Stripe/GCal/iCal コマンド                                                |
| `src/shared/lib/validations/section-defaults.ts`     | セクション defaults/getters/parsers/getSafeConfig                        |
| `src/shared/lib/validations/section-metadata.ts`     | セクション labels/icons/categories                                       |
| `src/shared/lib/validations/enums/`                  | 型ガード（guards）+ ヘルパー（helpers）                                  |

**インポートエイリアス**: `@/*`（`src/*`）, `@/admin/*`, `@/public/*`, `@/shared/*`, `@generated/*`

**管理画面パスの二重構造**: `src/app/(admin)/admin/(dashboard)/...` → URL `/admin/...`。**公開 ↔ 管理の遷移はフルページリロード**（異なる Root Layout）

### Lexical エディタ（管理画面・ブロック設定パネル）

- 実装ディレクトリ: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/`
- **barrel 廃止**: `editor/index.ts`, `editor/lexical/index.ts` は削除済み。`LazyLexicalEditor` は `lexical/LazyLexicalEditor` から、`EMPTY_LEXICAL_EDITOR_STATE_JSON` は `@/shared/lib/validations/lexical` から直接 import
- 詳細（Inspector・コンテンツ幅・レイアウト定数・DraggableBlock フォーク・プレースホルダー）: **`.claude/rules/frontend/lexical-patterns.md`**
- `showInspector={false}` でサイドバー無効、幅 1024px 未満で `MobileEditorFallback`（headless HTML プレビュー）
- 初期化は `contentJson` のみ（空は `EMPTY_LEXICAL_EDITOR_STATE_JSON`）

### インラインコンテンツエディタ（Post/News・メタデータサイドパネル）

- 実装ディレクトリ: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/`（`UnifiedSidePanel`, `content-types/post.tsx` / `news.tsx`）
- 詳細（`SidePanelDefinition` / `render(ctx)` / `PostSidePanelExtra` 等）: **`.claude/rules/frontend/admin-inline-editor-patterns.md`**（`docs/reference/codex-rules/admin-inline-editor-patterns.md` と同一方針）

### コマンド

```bash
bun dev                                         # 開発サーバー
bun run test                                    # テスト（`bunfig.toml` preload: setup-dom.ts で JSDOM 注入）
bun run test:unit                               # Unit テストのみ（__tests__/unit）
bun run test:integration                        # Integration テストのみ（__tests__/integration）
bun run test:all                                # Unit → Integration 順次テスト
bun run validate                                # type-check → lint 順次検証
bun run validate && bun run build               # 完全検証
bun run build:strict                            # 環境変数チェック有りビルド（本番確認用）
bunx --bun prisma migrate dev --name <name>     # マイグレーション（[開発ワークフロー](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production)）
bun prisma/seed.ts                               # Seed（引数なしは demo 相当。`createAppPrismaClient` 適用済みクライアントを使用）
bun run db:generate                             # Prisma スキーマ再生成
bun run db:studio                               # Prisma Studio（DB GUI）
bun run e2e                                     # E2E テスト（Playwright）
ANALYZE=true bun run build                      # バンドル分析（@next/bundle-analyzer）
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
- 設定セクション: `useFormAction` + `Form`/`FormField`/`FormMessage` + `disabled={!form.formState.isDirty}` → `admin-ui-patterns.md`
- **複雑な管理 CRUD フォーム**（DnD・`useFieldArray`・メディアピッカー等）: `admin-ui-patterns.md` の「useFormAction 非適用の例外」に従い、**`useActionState` + `FormData` + Server Action** 可。参照実装: `SpaceEditForm`、`submitSpaceFormAction`、`@/admin/lib/space-form-data-codec`（詳細は `.claude/rules/server-actions.md` の「複雑な管理フォームと FormData」）
- 設定セクションのスキーマ: Server Action 用（`nullable()`）とフォーム用（空文字列許容）は責務分離。`emptyToNull()` で送信時変換
- 命名: 管理画面コンポーネント `PascalCase.tsx`、公開ページコンポーネント `kebab-case.tsx`、その他 `kebab-case.ts`
- 公開ページ: Page-First Architecture — ページ構成はコードで直接定義、`SectionRenderer` は `[...segments]` のみ
- 公開ページコンテンツ: `getPageContent(pageKey, schema, default)` で DB から取得（`'use cache'` + `cacheTag`）
- 公開ページフォーム: `usePublicForm`（`@/public/hooks/use-public-form`）+ Turnstile + fireAndForget メール。`executeAdminMutationResult` は使わない
- **barrel export 禁止（全体）**: 新規 `index.ts` barrel の作成禁止。既存 barrel は直接 import に移行済み。例外: `plugins/index.ts`, `nodes/index.ts`（Lexical 内部用）
- 公開ページ import: Design System は直接 import（`from "@/public/components/design-system/button"` 等）
- コミット: `<type>(<scope>): <subject>`

### ⚠️ Gotchas

→ `.claude/rules/gotchas.md`（環境・ビルド・デプロイ・ツール系 — 常時ロード）
→ ドメイン固有の gotcha は各 `.claude/rules/` ファイルの `## Gotchas` セクションに統合済み
