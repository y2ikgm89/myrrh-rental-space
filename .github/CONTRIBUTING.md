# Contributing to Myrrh Rental Space

このドキュメントは開発者向けのクイックスタートです。AI エージェント作業の正本は [`AGENTS.md`](../AGENTS.md)（Codex）と [`CLAUDE.md`](../CLAUDE.md)（Claude Code）です。

## 開発環境セットアップ

### 前提ソフトウェア

- **Bun** — `package.json#packageManager` で固定。`bun upgrade` で揃える
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
bunx --bun prisma migrate dev
bun run db:seed

# 開発サーバー起動
bun dev
```

`bun dev` は Turbopack で起動し、`http://localhost:3000` で公開ページ、`http://localhost:3000/admin` で管理画面を開けます。

### 初回ログイン

- **管理者**: `bun prisma/seed.ts --admin <email> <password>` で作成、または seed 完了時に表示されるデフォルト admin
- **顧客**: `/login` ページの「テスト顧客でログイン」ボタン（dev 限定）

## ブランチ戦略

**Trunk-based development + continuous deployment** を採用しています。

```
main                       ← 本番反映（Cloud Run へ自動 deploy）
feature/*, fix/*, chore/*  ← PR ベースで main にマージ
```

- `main` への直接 push は禁止（[`branch-protection.json`](./branch-protection.json) で required status checks 5 種を gate）
- feature ブランチは `main` 起点で作成
- **破壊的変更**は PR description に明記し CODEOWNERS レビュー必須
- 短命 feature branch を意識（large stack を避け、merge 後即削除）

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
docs(agents): document Prisma re-export gateway rules
```

## 開発フロー

### 1. 計画作成（大規模変更）

大きな機能追加・破壊的変更は事前に計画を作成：

```bash
# docs/superpowers/plans/YYYY-MM-DD-<name>.md を docs/templates/plan.md からコピー
```

詳細は [`docs/superpowers/plans/`](../docs/superpowers/plans/) と [`docs/templates/`](../docs/templates/) を参照。

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
# 単体 + 統合（per-file isolation runner）
bun run test:all

# 特定ファイルのみ（日常開発はこれで十分）
bun test __tests__/unit/domain/reservations/commands.test.ts
bun test --watch __tests__/unit/domain/reservations/commands.test.ts  # TDD
bun test --bail=1 <file>                                              # fail fast
bun test --test-name-pattern "<name>"                                 # 名前フィルター

# E2E（dev サーバー自動起動）
bun run e2e

# E2E（特定 project）
bunx playwright test --project=chromium-customer
```

**注意**:

- `bun test __tests__/unit/domain/reservations`（親ディレクトリ指定）は `mock.module` グローバル干渉のため禁止。単一ファイル指定か `bun run test:unit` / `test:integration` を使う
- フル実行を毎回行う必要はない。lefthook pre-push と CI が自動で守る
- Coverage は per-directory batch と非互換のため CI ゲートなし。必要時 `bun test --coverage <single-file>` を参考値として取る

### 4. PR 作成

```bash
git checkout -b feature/my-feature
# 実装・コミット
gh pr create
```

PR template（[`pull_request_template.md`](./pull_request_template.md)）を埋めてください。

## 品質ゲート

CI で実行される必須 / opt-in job の SSoT は [`.claude/rules/ops/ci-workflow.md`](../.claude/rules/ops/ci-workflow.md)。重い job（E2E / Visual / Lighthouse）は PR label / `workflow_dispatch` で opt-in。

## セキュリティ

脆弱性を発見した場合は **公開 issue を開かず** [`SECURITY.md`](./SECURITY.md) の指示に従って報告してください。

## ハードルール

ハードルールの SSoT は [`AGENTS.md`](../AGENTS.md)（Codex 用）と [`CLAUDE.md`](../CLAUDE.md)（Claude Code 用）です。本 CONTRIBUTING には複製しません（drift 防止）。

## 質問・サポート

- プロジェクト固有の疑問: [`AGENTS.md`](../AGENTS.md) + [`.agents/skills/`](../.agents/skills/) を先に読む
- 実装パターン: [`docs/explanation/`](../docs/explanation/)（設計の「なぜ」）/ [`docs/how-to/`](../docs/how-to/)（手順）を参照（過去の判断は git log で辿る）。ライブラリ API は公式 docs を直接参照
- それでも不明な場合: GitHub Issue（bug / feature template）または owner に直接連絡
