# Myrrh Rental Space

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js 16 の **Multiple Root Layouts** で完全分離し、業務ロジックは `src/shared/domain/*`、Prisma 境界は `src/shared/db/*` に閉じ込めた、Editorial Magazine 調の予約プラットフォームです。

## 技術スタック

| カテゴリ       | 技術                               | バージョン | 備考                                             |
| -------------- | ---------------------------------- | ---------- | ------------------------------------------------ |
| フレームワーク | Next.js App Router + Turbopack     | 16.2.3     | PPR (`cacheComponents: true`), React Compiler    |
| UI             | React                              | 19.2.5     | Compiler 1.0 自動メモ化、`use()` / Activity 対応 |
| 言語           | TypeScript                         | 6.0.2      | `erasableSyntaxOnly`, `verbatimModuleSyntax`     |
| ランタイム     | Bun                                | 1.3.12     | パッケージ管理 + test runner                     |
| ORM            | Prisma (`prisma-client` generator) | 7.7.0      | ESM, Turbopack 対応, browser entry               |
| 認証           | Better Auth (dual instance)        | 1.6.5      | adminAuth / customerAuth、Google/LINE OAuth      |
| 決済           | Stripe                             | latest     | Checkout + Webhook                               |
| スタイリング   | Tailwind CSS (CSS-first)           | 4.2.2      | `@theme`, semantic tokens                        |
| 検証           | Zod                                | 4.3.6      | `error:` パラメータ、native enum                 |
| エディタ       | Lexical                            | 0.43.0     | NodeState API                                    |
| E2E            | Playwright                         | latest     | storage state auth, 786 tests                    |
| a11y           | @axe-core/playwright               | 4.11.1     | WCAG 2.1 AA 自動検証                             |
| Perf 監視      | Lighthouse CI                      | 0.15.1     | budget.json で granular gate                     |

## アーキテクチャ概要

```text
src/
├── app/
│   ├── (public)/          # 公開ページ（Editorial Magazine テーマ）
│   ├── (admin)/           # 管理画面（Swiss Industrial テーマ）
│   └── api/               # 公開 API / auth / cron / webhooks
├── shared/
│   ├── db/                # Prisma singleton, Better Auth adapter
│   ├── domain/            # 業務コマンド・クエリ（27 ドメイン）
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

詳細は [`CLAUDE.md`](./CLAUDE.md) のハードルール + SSoT 表、および [`.claude/rules/**/*.md`](./.claude/rules/) を参照してください。

## セットアップ

### 前提条件

- **Bun** 1.3.12+
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
bunx --bun prisma migrate deploy
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

| コマンド                   | 説明                                           |
| -------------------------- | ---------------------------------------------- |
| `bun run test:all`         | 単体 + 統合テスト（per-directory batch）       |
| `bun run test:unit`        | 単体のみ                                       |
| `bun run test:integration` | 統合のみ                                       |
| `bun test <path>`          | 単一ファイル（日常開発はこれで十分、ADR 0014） |
| `bun run e2e`              | Playwright E2E（全 project）                   |
| `bun run e2e:ui`           | Playwright UI モード                           |
| `bun run lhci`             | Lighthouse CI（perf/a11y/SEO/best-practices）  |

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

## CI 品質ゲート（12 jobs）

全 PR は以下の自動チェックを通過する必要があります：

| Job                  | 内容                                               | Blocking |
| -------------------- | -------------------------------------------------- | :------: |
| `policy-docs-sync`   | `.claude/rules` ↔ `codex-rules` の同期確認         |    ✅    |
| `lint-and-typecheck` | Prettier format check + ESLint + `tsc --noEmit`    |    ✅    |
| `unit-tests`         | Bun test (per-directory batch) + integration tests |    ✅    |
| `e2e-tests`          | Playwright（786 tests、全 project、browser cache） |    ✅    |
| `build`              | env validation ありの本番ビルド                    |    ✅    |
| `dependency-audit`   | `bun audit` + artifact 保存                        | ⚠️ warn  |
| `bundle-analysis`    | Turbopack `next experimental-analyze` artifact     |    ✅    |
| `lighthouse-ci`      | perf / a11y / SEO / best-practices + budget.json   |    ✅    |
| `visual-regression`  | Playwright `toHaveScreenshot`                      |  opt-in  |
| `codeql`             | GitHub Advanced Security（security-extended）      |    ✅    |
| `actionlint`         | GitHub Actions workflow YAML lint                  |    ✅    |
| `docs`               | API ドキュメント生成（main のみ）                  |   main   |

## 実装ハードルール（抜粋）

詳細は [`CLAUDE.md`](./CLAUDE.md) 参照。主要ルール：

- **型アサーション（`as`）禁止** — 型ガード / `satisfies` / Zod `safeParse` を使用
- **`useCallback` / `useMemo` / `memo` 禁止** — React Compiler 1.0 が自動メモ化
- **配列 uniqueness はスキーマ層で契約** — Zod `.refine()` で重複拒否、UI 層 Set dedup 禁止
- **ハードコードカラー禁止** — セマンティックトークン必須
- **`className` テンプレートリテラル禁止** — `cn()` を使用
- **Turnstile 配置基準** — 未認証公開フォームは必須
- **app 層からの Prisma 直 import 禁止** — `@/shared/lib/validations/enums/prisma-types` gateway 経由
- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須**

## 開発フロー

1. 大規模変更は `docs/plans/YYYY-MM-DD-*.md` に計画を作成
2. feature ブランチで実装
3. `bun run validate && bun run build` で最終検証
4. PR 作成（[`.github/pull_request_template.md`](./.github/pull_request_template.md) を埋める）
5. CI 12 jobs を通過
6. CODEOWNERS レビュー
7. マージ

## ドキュメント

- [`CLAUDE.md`](./CLAUDE.md) — Claude Code / 開発者向け正本ハードルール・SSoT 表
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — 開発環境セットアップ・ブランチ戦略・コミット規約
- [`SECURITY.md`](./SECURITY.md) — 脆弱性報告 policy・対応 SLA
- [`.claude/rules/`](./.claude/rules/) — ドメイン別実装ルール（paths frontmatter で自動ロード）
- [`docs/plans/`](./docs/plans/) — 進行中プランのみ（完了プランは git history と ADR で辿る、clean-break 原則）
- [`docs/architecture/`](./docs/architecture/) — アーキテクチャ図・設計判断記録

## ライセンス

Private / Proprietary
