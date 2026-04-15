# Contributing to Myrrh Rental Space

このドキュメントは開発者向けのクイックスタートです。プロジェクト固有のハードルール・アーキテクチャ詳細は [`CLAUDE.md`](./CLAUDE.md) を参照してください。

## 開発環境セットアップ

### 前提ソフトウェア

- **Bun** 1.3.11+ — パッケージ管理・スクリプト実行
- **Node.js** 20+ — 一部 CLI ツール
- **PostgreSQL** 16 — ローカル DB
- **Git** 2.40+

### 初期セットアップ

```bash
# 依存インストール（postinstall で prisma generate も実行）
bun install

# .env.local を作成（.env.example があれば参照）
cp .env.example .env.local
# 必要な env var を設定: DATABASE_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY, etc.

# DB マイグレーション適用 + seed
bunx --bun prisma migrate deploy
bun run db:seed

# 開発サーバー起動
bun dev
```

`bun dev` は Turbopack で起動し、`http://localhost:3000` で公開ページ、`http://localhost:3000/admin` で管理画面を開けます。

### 初回ログイン

- **管理者**: `bun prisma/seed.ts --admin <email> <password>` で作成、または seed 完了時に表示されるデフォルト admin
- **顧客**: `/login` ページの「テスト顧客でログイン」ボタン（dev 限定）

## ブランチ戦略

```
main     ← 本番反映
develop  ← staging 反映
feature/*, fix/*, chore/*  ← PR ベースで develop にマージ
```

- `main` / `develop` への直接 push は禁止
- feature ブランチは `develop` 起点で作成
- **破壊的変更**は PR description に明記し CODEOWNERS レビュー必須

## コミット規約

[Conventional Commits](https://www.conventionalcommits.org/) に準拠：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 主要 type

| Type       | 用途                                 |
| ---------- | ------------------------------------ |
| `feat`     | 新機能                               |
| `fix`      | バグ修正                             |
| `refactor` | リファクタリング（動作変更なし）     |
| `perf`     | パフォーマンス改善                   |
| `test`     | test 追加・修正                      |
| `docs`     | ドキュメント                         |
| `chore`    | ビルド・ツール・依存更新             |
| `ci`       | CI / workflow 変更                   |
| `style`    | フォーマッティング（コード変更なし） |

### 例

```
feat(reservation): add customer cancellation flow with refund
fix(stripe): handle webhook race condition in payment_intent.succeeded
refactor(domain): split reservations commands into lifecycle/admin/public
docs(claude.md): document Prisma re-export gateway rules
```

## 開発フロー

### 1. 計画作成（大規模変更）

大きな機能追加・破壊的変更は事前に計画を作成：

```bash
# docs/plans/YYYY-MM-DD-<name>.md を手動作成、または
# Claude Code の brainstorming → writing-plans スキルチェーンで自動生成
```

詳細は [`docs/plans/CLAUDE.md`](./docs/plans/CLAUDE.md) を参照。

### 2. 実装

```bash
# 作業中は type-check でチェック
bun run type-check

# コミット前に validate（type-check + lint）
bun run validate

# PR 作成前に full build 含めて検証
bun run validate && bun run build
```

### 3. テスト

```bash
# 単体 + 統合（per-directory batch）
bun run test:all

# 特定ディレクトリのみ
bun test __tests__/unit/domain/reservations

# E2E（dev サーバー自動起動）
bun run e2e

# E2E（特定 project）
bunx playwright test --project=chromium-customer

# カバレッジ
bun run test:coverage:check
```

**注意**: `bun test` 単体実行は `mock.module` グローバル干渉を引き起こすため禁止。必ず `test:unit` / `test:integration` の per-directory batch を使用してください。

### 4. PR 作成

```bash
git checkout -b feature/my-feature
# 実装・コミット
gh pr create
```

PR template（`.github/pull_request_template.md`）を埋めてください。

## 品質ゲート

CI で以下が自動実行されます：

| Gate                 | 内容                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| `policy-docs-sync`   | `.claude/rules` と `codex-rules` の同期確認                                       |
| `lint-and-typecheck` | ESLint + `tsc --noEmit`                                                           |
| `unit-tests`         | bun test with coverage threshold 90%                                              |
| `e2e-tests`          | Playwright（全 project、Playwright browsers cache 対応）                          |
| `build`              | env validation ありの `bun run build`                                             |
| `dependency-audit`   | `bun audit`（non-blocking、artifact として保存）                                  |
| `lighthouse-ci`      | perf (warn >85) / a11y (error >90) / SEO (error >90) / best-practices (error >90) |
| `bundle-analysis`    | Turbopack `next experimental-analyze --output` artifact                           |
| `codeql`             | GitHub Advanced Security（security-extended query set）                           |
| `actionlint`         | GitHub Actions workflow YAML lint                                                 |
| `visual-regression`  | Playwright `toHaveScreenshot` (opt-in via `visual-regression` label)              |

## セキュリティ

脆弱性を発見した場合は **公開 issue を開かず** [`SECURITY.md`](./SECURITY.md) の指示に従って報告してください。

## ハードルール（CLAUDE.md 抜粋）

以下は [`CLAUDE.md`](./CLAUDE.md) のハードルールのダイジェストです。詳細は本体を参照：

- **型アサーション（`as`）禁止** — 型ガード・`satisfies`・`safeParse` を使用
- **`useCallback`/`useMemo`/`memo` 禁止** — React Compiler 1.0 が自動メモ化
- **配列 uniqueness はスキーマ層で契約** — Zod `.refine()` で重複拒否、UI 層 Set dedup 禁止
- **ハードコードカラー禁止** — セマンティックトークン必須
- **`className` テンプレートリテラル禁止** — `cn()` 使用
- **Turnstile 配置基準** — 未認証公開フォームは必須
- **app 層からの Prisma 直 import 禁止** — `@/shared/lib/validations/enums/prisma-types` gateway 経由
- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須**

## 質問・サポート

- プロジェクト固有の疑問: `CLAUDE.md` + `.claude/rules/` を先に読む
- 実装パターン: `docs/plans/` の過去計画を参照
- それでも不明な場合: GitHub Issue（bug / feature template）または owner に直接連絡
