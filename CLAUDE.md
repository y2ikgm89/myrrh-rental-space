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

| タイミング | コマンド |
|-----------|---------|
| 作業中 | `bun run type-check` |
| 完了報告前 | `bun run type-check && bun run lint` |
| コミット/PR前 | `bun run type-check && bun run lint && bun run build` |

### 詳細ルール

- `.claude/rules/type-safety.md` - 型安全ルール
- `.claude/rules/implementation-quality.md` - 実装品質ルール
- `.claude/rules/test-quality.md` - テスト品質ルール
- `.claude/rules/react-patterns.md` - React 19.2 / React Compiler
- `.claude/rules/server-actions.md` - Next.js 16 Server Actions / キャッシュ
- `.claude/rules/auth-patterns.md` - Better Auth 1.4 / RBAC
- `.claude/rules/prisma-patterns.md` - Prisma 7 / JSON型安全
- `.claude/rules/zod-patterns.md` - Zod 4 バリデーション
- `.claude/rules/nuqs-patterns.md` - nuqs URL状態管理
- `.claude/rules/tailwind-patterns.md` - Tailwind CSS 4 / CSS-first設定
- `.claude/rules/lexical-patterns.md` - Lexical 0.39 エディタ実装
- `.claude/rules/ui-ux-patterns.md` - UI/UX スキル使用ガイドライン

---

## 🟡 ワークフロー

**superpowersが自動発動** — 特別な操作不要

> **セッション継続時**: `docs/plans/README.md` を確認して進行中タスクを把握

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
                  ↑ 全工程でsuperpowersが自動介入
```

### 自動発動スキル

| スキル | 発動タイミング | 推奨ツール |
|--------|----------------|-----------|
| - | 要件確認時 | `AskUserQuestion` |
| - | コードベース調査時 | `code-explorer`, `serena` * |
| `brainstorming` | 機能追加・設計時 | `context7`, `WebSearch`, `WebFetch` |
| `ui-ux-pro-max` | UI/UXデザイン方針決定時 | `search.py` * |
| `frontend-design` | フロントエンドUI実装時 | - |
| `writing-plans` | 計画作成時 | - |
| `executing-plans` | 計画実行時 | - |
| `test-driven-development` | 実装時 | `serena` |
| - | 実装後の整理 | `code-simplifier` |
| `systematic-debugging` | バグ調査時 | `serena`, `code-explorer` |
| `verification-before-completion` | 完了報告前 | `playwright`, `bun run test` |
| `requesting-code-review` | レビュー依頼時 | - |
| `receiving-code-review` | レビュー対応時 | - |
| `finishing-a-development-branch` | ブランチ完了時 | - |
| - | 実装完了後 | ドキュメント更新 * |

\* **ドキュメント更新対象:** `docs/plans/NNN-title.md`作成 → `docs/plans/README.md`更新 → `docs/requirements/`（必要時） → `docs/architecture/`（設計変更時）

\* **コードベース調査ツール使い分け:**
- `serena`: シンボル参照追跡・定義ジャンプ・構造化コードの深い分析（LSPベース）
- `code-explorer`: 広範なキーワード検索・ファイル構造探索・探索範囲が不明確な場合

\* **ui-ux-pro-max検索:**
```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> --stack nextjs
```
ドメイン: `product`, `style`, `typography`, `color`, `landing`, `chart`, `ux`

### superpowers使用基準

| 状況 | 判断 |
|------|------|
| 原因明確なバグ修正 | 省略可 |
| 1-2ファイルの小規模修正 | 省略可 |
| ユーザーが具体的に指示 | 省略可 |
| `verification-before-completion` | **常に必須** |

### MCPツール

| ツール | 用途 | 優先度 |
|--------|------|--------|
| `serena` | セマンティックコード分析・シンボル操作・リファクタリング | 🟡 推奨 |
| `context7` | ライブラリAPI・最新ドキュメント取得 | 🟡 推奨 |
| `playwright` | E2Eテスト・ブラウザ操作 | 🟡 推奨 |
| `WebSearch` | 最新情報・エラー解決検索 | 🟢 必要時 |
| `WebFetch` | 公開URL・GitHubリポジトリ取得 | 🟢 必要時 |

### 手動コマンド（必要時のみ）

| コマンド | 用途 |
|---------|------|
| `/superpowers:brainstorm` | 設計を明示的に開始 |
| `/superpowers:write-plan` | 計画作成を明示的に開始 |
| `/superpowers:execute-plan` | 計画実行を明示的に開始 |
| `/superpowers:using-git-worktrees` | 隔離開発環境作成 |
| `/ui-ux-pro-max` | UI/UXデザイン方針決定 |
| `/frontend-design` | フロントエンドUI実装 |
| `code-explorer` | コードベース深掘り分析 |
| `code-simplifier` | コード整理・簡略化 |

---

## 🟢 プロジェクト情報

### 技術スタック

| 技術 | バージョン | 備考 |
|------|-----------|------|
| Next.js | 16.1.4 | `'use cache'`, `updateTag`, PPR対応 |
| React | 19.2.3 | React Compiler 1.0, `<Activity>`, `useEffectEvent` |
| TypeScript | 5.9.3 | TS 7.0 (Go native) プレビュー利用可 |
| Bun | 1.3.x | Bun.SQL, HTML直接実行 |
| Prisma | 7.3.0 | 型生成98%削減, mapped enums |
| PostgreSQL | - | Supabase経由 |
| Better Auth | 1.4.17 | RBAC, Auth.js統合 |
| Tailwind CSS | 4.1.18 | CSS-first設定, @theme |
| Zod | 4.3.6 | `{ error: }` パラメータ, z.fromJSONSchema() |
| nuqs | 2.8.6 | createSearchParamsCache, Zod 4統合 |
| Lexical | 0.39.0 | React 19対応, Node transforms |

### 構造

**Multiple Root Layouts アーキテクチャ（Next.js 16 推奨パターン）**

```
src/app/
├── (admin)/                              # 管理画面ルートグループ
│   ├── layout.tsx                        # Admin Root Layout (html/body)
│   ├── _styles/admin.css                 # 管理画面専用テーマ（固定）
│   └── admin/(dashboard)/_shared/        # 管理画面共有コンポーネント
│
├── (public)/                             # 公開ページルートグループ
│   ├── layout.tsx                        # Public Root Layout (html/body)
│   ├── _styles/public.css                # 公開ページテーマ（AI生成対象）
│   ├── [slug]/page.tsx                   # セクションベースページ（統一ルート）
│   └── _shared/                          # 公開ページ共有コンポーネント
│
└── src/shared/                           # 両方で共有（CSS変数非依存）
```

| パス | 用途 |
|------|------|
| `src/app/(admin)/_styles/admin.css` | 管理画面専用テーマ（Swiss Industrial Admin） |
| `src/app/(public)/_styles/public.css` | 公開ページテーマ（AI生成でカスタマイズ） |
| `src/app/(admin)/admin/(dashboard)/_shared/` | 管理画面専用コンポーネント |
| `src/app/(public)/_shared/` | 公開ページ専用コンポーネント |
| `src/app/(public)/[slug]/` | 統一ページルート（セクションシステム） |
| `src/shared/` | 共有（CSS変数に依存しないコード） |
| `docs/{requirements,architecture,plans}/` | ドキュメント |

**公開ページURL構造**:
- `/` - ホームページ
- `/faq`, `/about`, `/contact`, `/spaces`, `/reservation`, `/privacy`, `/terms` - 専用ページ
- `/news`, `/news/[slug]` - ニュース
- `/posts`, `/posts/[slug]` - ブログ
- `/spaces/[slug]` - スペース詳細
- `/[slug]` - カスタムページ（DBで管理）

**注意**:
- 公開ページ ↔ 管理画面の遷移はフルページリロード（異なるRoot Layout間の仕様）
- 旧URLの `/p/[slug]` は廃止済み

### エイリアス

`@/admin/*`, `@/public/*`, `@/shared/*`

### コマンド

```bash
bun dev                    # 開発サーバー
bun run test               # テスト
bun run type-check && bun run lint && bun run build  # 検証
bunx --bun prisma migrate dev --name <name>  # マイグレーション
bun run db:generate        # Prismaスキーマ再生成
```

### コーディング規約

- Server Components優先、Server Actions
- Zodバリデーション必須
- 命名: コンポーネント`PascalCase.tsx`、その他`kebab-case.ts`
- コミット: `<type>(<scope>): <subject>`

---

## セットアップ（初回のみ）

```bash
# superpowersインストール
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace

# ui-ux-pro-max（プロジェクトローカル、インストール済み）
# CLIでインストール: npm install -g uipro-cli && uipro init --ai claude
# 配置: .claude/skills/ui-ux-pro-max/
```
