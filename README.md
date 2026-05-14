# Myrrh Rental Space

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js 16 の **Multiple Root Layouts** で完全分離し、業務ロジックは `src/shared/domain/*`、Prisma 境界は `src/shared/db/*` に閉じ込めた、Editorial Magazine 調の予約プラットフォームです。

## 技術スタック

確定バージョンの SSoT は [`package.json`](./package.json) + [`bun.lock`](./bun.lock)。採用判断・トレードオフは [`docs/explanation/tech-stack.md`](./docs/explanation/tech-stack.md) を参照。

| カテゴリ       | 技術                               | 主機能                                                              |
| -------------- | ---------------------------------- | ------------------------------------------------------------------- |
| フレームワーク | Next.js App Router + Turbopack     | PPR (`cacheComponents: true`), React Compiler 1.0                   |
| UI             | React 19                           | Compiler 自動メモ化、`use()`, Activity                              |
| 言語           | TypeScript 6                       | `erasableSyntaxOnly`, `verbatimModuleSyntax`                        |
| ランタイム     | Bun                                | パッケージ管理 + test runner、`packageManager` 経由でバージョン固定 |
| ORM            | Prisma (`prisma-client` generator) | ESM, Turbopack 対応, browser entry                                  |
| 認証           | Better Auth (dual instance)        | adminAuth / customerAuth、Google/LINE OAuth                         |
| 決済           | Stripe                             | Checkout + Webhook                                                  |
| スタイリング   | Tailwind CSS (CSS-first)           | `@theme`, semantic tokens                                           |
| 検証           | Zod 4                              | `error:` パラメータ、native enum                                    |
| エディタ       | Lexical                            | NodeState API、Portable Text 直列化                                 |
| E2E            | Playwright                         | storage state auth                                                  |
| a11y           | @axe-core/playwright               | WCAG 2.1 AA 自動検証 + 2.5.5 Enhanced (AAA) touch target 規約       |
| Perf 監視      | Lighthouse CI                      | `.lighthouseci/budget.json` で granular gate                        |

## アーキテクチャ概要

```text
src/
├── app/
│   ├── (public)/          # 公開ページ（Editorial Magazine テーマ）
│   ├── (admin)/           # 管理画面（Swiss Industrial テーマ）
│   ├── (preview)/         # 管理画面向けプレビュー（ManagedPageSections 共有）
│   └── api/               # 公開 API / auth / cron / webhooks
├── shared/
│   ├── db/                # Prisma singleton, Better Auth adapter
│   ├── domain/            # 業務コマンド・クエリ
│   └── lib/
│       ├── validations/enums/prisma-types.ts  # client-safe Prisma gateway
│       ├── {admin,customer}-auth.ts           # dual auth instance
│       └── env/, crypto.ts, stripe.ts         # 外部連携
├── instrumentation.ts
└── proxy.ts               # rate-limit + CSP nonce + security headers
```

**主要な分離原則**:

- **Multiple Root Layouts**: 公開 `(public)/layout.tsx` と管理 `(admin)/layout.tsx` が独立した html/body/CSS を持ち、遷移はフルページリロード
- **Prisma gateway**: app 層は `@/shared/lib/validations/enums/prisma-types`（browser entry 由来、type-only）経由でのみ Prisma 型にアクセス。runtime 値は `shared/db/` / `shared/domain/` のみ直接 import 可
- **`executeAdminMutationResult`**: 管理 write 系 Server Actions は認証・権限・監査ログを一括処理

Codex 作業の正本は [`AGENTS.md`](./AGENTS.md) と [`.agents/skills/`](./.agents/skills/) です。Claude Code 作業の正本は [`CLAUDE.md`](./CLAUDE.md) と [`.claude/`](./.claude/) です。両ツールの境界は [`docs/explanation/ai-instructions.md`](./docs/explanation/ai-instructions.md)。

## セットアップ

### 前提条件

- **Bun** — `package.json#packageManager` で固定。ローカルは `bun upgrade` で同バージョンに合わせる
- **Node.js** 20+（CLI ツール向け）
- **PostgreSQL** 16（Docker 推奨）
- **Git** 2.40+

### 初期構築

```bash
# 依存インストール（postinstall で prisma generate、prepare で lefthook install）
bun install

# 環境変数設定
cp .env.example .env.local
# DATABASE_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY 等を設定

# DB 起動 + migrate + seed
docker compose up -d db
bunx --bun prisma migrate dev
bun run db:seed

# 開発サーバー
bun run dev
```

## 主要コマンド

### 開発

| コマンド                            | 説明                                    |
| ----------------------------------- | --------------------------------------- |
| `bun run dev`                       | 開発サーバー起動（Turbopack）           |
| `bun run validate`                  | `type-check` + `lint`（作業中チェック） |
| `bun run validate && bun run build` | **コミット前必須**                      |
| `bun run build:skip-env`            | env 未設定時ビルド                      |
| `bun run analyze`                   | Turbopack-native bundle 解析            |
| `bun run format`                    | Prettier 全ファイル整形                 |

### テスト

| コマンド                   | 説明                                          |
| -------------------------- | --------------------------------------------- |
| `bun run test:all`         | 単体 + 統合テスト（per-file isolation）       |
| `bun run test:unit`        | 単体のみ                                      |
| `bun run test:integration` | 統合のみ                                      |
| `bun test <path>`          | 単一ファイル（日常開発はこれで十分）          |
| `bun run e2e`              | Playwright E2E（全 project）                  |
| `bun run e2e:ui`           | Playwright UI モード                          |
| `bun run lhci`             | Lighthouse CI（perf/a11y/SEO/best-practices） |

### DB

| コマンド                        | 説明                              |
| ------------------------------- | --------------------------------- |
| `bun run db:generate`           | Prisma Client 生成                |
| `bunx --bun prisma migrate dev` | マイグレーション作成・適用（dev） |
| `bun run db:seed`               | Seed 実行                         |
| `bun run db:studio`             | Prisma Studio 起動                |

### Visual Regression（opt-in）

```bash
# 初回 baseline 生成
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual --update-snapshots

# diff 検証
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual
```

## CI 品質ゲート

全 PR は GitHub Actions で自動チェックされます。詳細仕様と opt-in label のリストは [`.claude/rules/ops/ci-workflow.md`](./.claude/rules/ops/ci-workflow.md)（path-scoped rule）を参照。Required / Opt-in の区分けは Stripe / Vercel 公式 CI と同じ "fast PR feedback + heavy jobs on demand" pattern。

## 実装ハードルール

ハードルールの SSoT は [`AGENTS.md`](./AGENTS.md)（Codex 用）と [`CLAUDE.md`](./CLAUDE.md)（Claude Code 用）です。本 README には複製しません（drift 防止）。

## 開発フロー

1. 大規模変更は [`docs/superpowers/plans/`](./docs/superpowers/plans/) に計画書を作成
2. feature ブランチで実装
3. `bun run validate && bun run build` で最終検証
4. PR 作成（[`.github/pull_request_template.md`](./.github/pull_request_template.md) を埋める）
5. CI 必須 jobs を通過
6. CODEOWNERS レビュー
7. マージ

## ドキュメント

- [`AGENTS.md`](./AGENTS.md) — Codex 向けプロジェクト指示
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 向けプロジェクト指示
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — 開発環境セットアップ・ブランチ戦略・コミット規約
- [`SECURITY.md`](./SECURITY.md) — 脆弱性報告 policy・対応 SLA
- [`docs/`](./docs/) — Diátaxis 構成のドキュメント（`explanation/` 設計・なぜ / `how-to/` 手順）。ライブラリ API は公式 docs を直接参照
- [`docs/explanation/ai-instructions.md`](./docs/explanation/ai-instructions.md) — Codex / Claude Code 正本配置

## ライセンス

Private / Proprietary
