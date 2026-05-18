# Myrrh Rental Space

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js の **Multiple Root Layouts** で完全分離し、業務ロジックは `src/shared/domain/*`、Prisma 境界は `src/shared/db/*` に閉じ込めた予約プラットフォームです。

## 技術スタック

確定バージョンの SSoT は [`package.json`](./package.json) + [`bun.lock`](./bun.lock)。採用判断・トレードオフは [`docs/explanation/tech-stack.md`](./docs/explanation/tech-stack.md) を参照（バージョン値はここでは管理しません — drift 防止）。

| カテゴリ       | 技術                           | 主な採用機能                                                          |
| -------------- | ------------------------------ | --------------------------------------------------------------------- |
| フレームワーク | Next.js App Router + Turbopack | PPR (`cacheComponents: true`), `'use cache'`, `updateTag`             |
| UI             | React 19                       | Compiler 1.0 自動メモ化、`use()`, `useEffectEvent`, Activity          |
| 言語           | TypeScript 6                   | `erasableSyntaxOnly`, `verbatimModuleSyntax`, `target: es2025`        |
| ランタイム     | Bun                            | パッケージ管理 + test runner、`packageManager` でバージョン固定       |
| ORM            | Prisma 7 (`prisma-client`)     | WASM client engine, mapped enums, Turbopack-ready                     |
| 認証           | Better Auth (dual instance)    | adminAuth / customerAuth、Google / LINE OAuth、RBAC                   |
| 決済           | Stripe                         | Checkout + Webhook                                                    |
| スタイリング   | Tailwind CSS 4 (CSS-first)     | `@theme`, semantic tokens, Container Queries                          |
| Validation     | Zod 4                          | `{ error: }` パラメータ、`z.registry<FieldMeta>()`                    |
| エディタ       | Lexical                        | NodeState API、Portable Text 直列化                                   |
| Forms          | conform                        | `useActionState` + `executeAdminMutationResult`、`@conform-to/zod/v4` |
| E2E            | Playwright                     | storage state auth、smoke / 広域 / a11y 分離                          |
| a11y           | @axe-core/playwright           | WCAG 2.1 AA 自動検証 + 2.5.5 Enhanced (AAA) touch target              |
| Perf 監視      | Lighthouse CI                  | `.lighthouseci/budget.json` で granular gate                          |

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

- **Multiple Root Layouts**: 公開 `(public)/layout.tsx`、管理 `(admin)/layout.tsx`、プレビュー `(preview)/layout.tsx` が独立した html/body/CSS を持ち、跨ぎ遷移はフルページリロード
- **Prisma gateway**: app 層は `@/shared/lib/validations/enums/prisma-types`（browser entry 由来、type-only）経由でのみ Prisma 型にアクセス。runtime 値は `shared/db/` / `shared/domain/` のみ直接 import 可
- **`executeAdminMutationResult`**: 管理 write 系 Server Actions は認証・権限・監査ログを一括処理

Codex 作業の正本は [`AGENTS.md`](./AGENTS.md) と [`.agents/skills/`](./.agents/skills/) です。Claude Code 作業の正本は [`CLAUDE.md`](./CLAUDE.md) と [`.claude/`](./.claude/) です。両ツールの境界は [`docs/explanation/ai-instructions.md`](./docs/explanation/ai-instructions.md)。

## セットアップ

### 前提条件

- **Bun** — `package.json#packageManager` で固定。ローカルは `bun upgrade` で同バージョンに合わせる
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

### テスト（業界標準 4 層）

| 層          | コマンド / 場所                                                | CI trigger            |
| ----------- | -------------------------------------------------------------- | --------------------- |
| Unit        | `bun run test:unit` (`__tests__/unit`)                         | 毎 push（required）   |
| Integration | `bun run test:integration` (`__tests__/integration`)           | 毎 push（required）   |
| Smoke E2E   | `bunx playwright test --project=chromium-smoke` (`e2e/smoke/`) | 毎 push（required）   |
| 広域 E2E    | `bun run e2e` (`e2e/{public,authenticated,a11y}/`)             | PR `e2e` label opt-in |

```bash
# 単一ファイルの開発時実行
bun test <path>

# ローカル全走（CI と lefthook pre-push に委ねるのが基本）
bun run test:all

# Playwright UI モード
bun run e2e:ui

# Lighthouse CI（perf/a11y/SEO/best-practices）
bun run lhci
```

per-file isolation runner（`scripts/run-tests.ts`）を経由し、`mock.module()` 干渉を物理排除します。詳細は [`.claude/rules/bun-patterns/test-runner.md`](./.claude/rules/bun-patterns/test-runner.md) / [`.claude/rules/test-quality/e2e.md`](./.claude/rules/test-quality/e2e.md)。

### DB

| コマンド                        | 説明                              |
| ------------------------------- | --------------------------------- |
| `bun run db:generate`           | Prisma Client 生成                |
| `bunx --bun prisma migrate dev` | マイグレーション作成・適用（dev） |
| `bun run db:seed`               | Seed 実行                         |
| `bun run db:studio`             | Prisma Studio 起動                |

### Visual Regression（opt-in）

```bash
# 初回 baseline 生成（CI 上で実行が canonical: workflow_dispatch update_visual_baseline=true）
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual --update-snapshots

# diff 検証
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual
```

baseline 再生成は CI Ubuntu runner と font rendering を合わせるため CI 上の `workflow_dispatch` 起動が canonical。詳細は [`.claude/rules/ops/ci-workflow/job-strategy.md`](./.claude/rules/ops/ci-workflow/job-strategy.md) §Visual baseline 再生成 SSoT。

## CI 品質ゲート

全 PR は GitHub Actions で自動チェックされます。Required / Opt-in 区分けは Stripe / Vercel 公式 CI と同じ "fast PR feedback + heavy jobs on demand" pattern。詳細仕様と opt-in label のリストは [`.claude/rules/ops/ci-workflow.md`](./.claude/rules/ops/ci-workflow.md)（path-scoped rule）を参照。

## デプロイ

Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）。Vercel は不使用。詳細手順は [`docs/how-to/deploy.md`](./docs/how-to/deploy.md)、Cloud Run / Docker パターンは [`.claude/rules/ops/deployment-patterns.md`](./.claude/rules/ops/deployment-patterns.md)。

## 実装ハードルール

ハードルールの SSoT は [`AGENTS.md`](./AGENTS.md)（Codex 用）と [`CLAUDE.md`](./CLAUDE.md)（Claude Code 用）です。本 README には複製しません（drift 防止）。

## 開発フロー

1. 大規模変更は [`docs/superpowers/plans/`](./docs/superpowers/plans/) に計画書を作成（雛形: [`docs/templates/plan.md`](./docs/templates/plan.md)）
2. feature ブランチで実装
3. `bun run validate && bun run build` で最終検証
4. PR 作成（[`.github/pull_request_template.md`](./.github/pull_request_template.md) を埋める）
5. CI 必須 jobs を通過
6. CODEOWNERS レビュー
7. squash merge → `git pull --ff-only` で main 同期

## ドキュメント

`docs/` は [Diátaxis](https://diataxis.fr/) フレームワークの **explanation / how-to** 軸のみ採用（tutorials / reference 軸は意図的に未配置 — reference は公式 docs / project rules、tutorials は AGENTS.md+CLAUDE.md 導線で代替）。

- [`AGENTS.md`](./AGENTS.md) — Codex 向けプロジェクト指示
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 向けプロジェクト指示
- [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md) — 開発環境セットアップ・ブランチ戦略・コミット規約
- [`.github/SECURITY.md`](./.github/SECURITY.md) — 脆弱性報告 policy・対応 SLA
- [`docs/`](./docs/) — Diátaxis 構成（[`explanation/`](./docs/explanation/) 設計・なぜ、[`how-to/`](./docs/how-to/) 手順・外部連携、[`superpowers/`](./docs/superpowers/) plan / spec、[`templates/`](./docs/templates/) plan 雛形）
- [`docs/explanation/ai-instructions.md`](./docs/explanation/ai-instructions.md) — Codex / Claude Code 正本配置

ライブラリ API は公式 docs を直接参照、プロジェクト固有のパターン・規約は [`.claude/rules/**`](./.claude/rules/)（Claude Code）と [`.agents/skills/**`](./.agents/skills/)（Codex）が SSoT です。

## ライセンス

Private / Proprietary
