# Contributing to Myrrh Rental Space

このドキュメントは開発者向けのクイックスタートです。ハードルール・エージェント作業の正本は
[CLAUDE.md](../CLAUDE.md) と [`.claude/rules/`](../.claude/rules/) です。
[AGENTS.md](../AGENTS.md) は CLAUDE.md へのポインタ兼補助メモです。

## 開発環境セットアップ

### 前提ソフトウェア

- **Bun** — `package.json#packageManager` で固定。`bun upgrade` で揃える
- **Node.js** 20+ — 一部 CLI ツール
- **PostgreSQL** 16 — ローカル DB（Docker Compose 推奨）
- **Git** 2.40+

### 初期セットアップ

依存インストール（`bun install`）は `bun run setup` には含まれません。

#### 短い経路

```bash
bun install
bun run setup    # .env.local（無ければ）+ db/test-db + migrate deploy + seed
bun run dev
```

#### 手動経路

```bash
bun install

# ローカル PostgreSQL（開発 DB。統合テスト時は test-db も起動）
docker compose up -d db
# docker compose up -d db test-db   # integration test 用

cp .env.example .env.local
# 本番専用 secret（ENCRYPTION_KEY, AUDIT_LOG_HMAC_KEY, Cloudflare 本番トークン等）は
# ローカルでは空のままでよい
# BETTER_AUTH_SECRET が placeholder のままなら:
#   openssl rand -base64 32

bun run db:generate
bun run db:migrate    # 新規 migration 作成時。適用のみなら prisma migrate deploy でも可
bun run db:seed

bun run dev
```

`bun run dev` は `http://localhost:3000` で公開ページ、`http://localhost:3000/admin` で管理画面を開けます。
`APP_SURFACE`（`.env.example` 参照）で admin / public のどちらを起動するか選びます。

### 初回アクセス

- **管理者（ローカル）**: `.env.local` に `ADMIN_TEST_IAP_EMAIL=admin@example.com` を設定し、`bun run db:seed` 後に `http://localhost:3000/admin` を開きます。アプリ用パスワードやログイントークン URL はありません。
- **管理者（本番）**: 管理画面は公開ドメインではなく、Cloud Run の admin service URL を Cloud Run direct IAP で保護します。Google アカウントが IAP 許可済みで、同じメールアドレスのスタッフ user が DB にある場合のみ `/admin` を開けます。公開ドメインの `/admin/*` は 404 にします。
- **顧客**: `/login` ページの「テスト顧客でログイン」ボタン（dev 限定）

## ブランチ戦略

**Trunk-based development + continuous deployment** を採用しています。

```
main                       ← 本番反映（Cloud Run へ自動 deploy）
feature/*, fix/*, chore/*  ← PR ベースで main にマージ
```

- `main` への直接 push は禁止（[`branch-protection.json`](./branch-protection.json) で required status checks を gate）
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

大きな機能追加・破壊的変更は、PR description に設計意図・トレードオフ・移行手順を明記してから着手する（過去の判断は git log / 関連 PR で辿る）。

### 2. 実装

```bash
# 変更を狭く証明
bun scripts/run-tests.ts path/to/file.test.ts
bun run lint:files -- path/to/changed.ts

# コミット前に validate（type-check + lint。テストは含まれない）
bun run validate

# PR 作成前に full build 含めて検証
bun run validate && bun run build
```

### 3. テスト

```bash
# 単体 + 統合（per-file isolation runner）
bun run test:all

# 実 DB 必須の統合テストは TEST_DATABASE_URL が必須。
# test:integration / test:all は test-db に migrate deploy を適用してから実行する
bun run test:db:migrate
bun run test:integration

# 特定ファイルのみ（日常開発はこれで十分）
bun scripts/run-tests.ts __tests__/unit/domain/reservations/commands.test.ts
bun run test -- __tests__/unit/domain/reservations/commands.test.ts

# E2E（dev サーバー自動起動）
bun run e2e

# E2E（特定 project）
bunx playwright test --project=chromium-customer
```

**注意**:

- 素の `bun test <path>` は禁止。必ず `bun scripts/run-tests.ts` または `bun run test --` を使う
- 親ディレクトリ指定（例: `__tests__/unit/domain/reservations`）は `mock.module` グローバル干渉のため禁止。単一ファイル指定か `bun run test:unit` / `test:integration` を使う
- フル実行を毎回行う必要はない。lefthook pre-push と CI が自動で守る
- Coverage は per-directory batch と非互換のため CI ゲートなし

### 4. PR 作成

```bash
git checkout -b feature/my-feature
# 実装・コミット
gh pr create
```

PR template（[`pull_request_template.md`](./pull_request_template.md)）を埋めてください。

## 品質ゲート

CI で実行される必須 / opt-in job の定義は [`.github/workflows/`](./workflows) が SSoT。重い job（E2E / Visual / Lighthouse）は `codex/full-ci/` で始まる PR branch、または `workflow_dispatch` の `run_full_ci=true` で opt-in。

## セキュリティ

脆弱性を発見した場合は **公開 issue を開かず** [`SECURITY.md`](./SECURITY.md) の指示に従って報告してください。

## ハードルール

ハードルールの SSoT は [CLAUDE.md](../CLAUDE.md) と [`.claude/rules/`](../.claude/rules/) です。
本 CONTRIBUTING には複製しません（drift 防止）。エージェント向け補助は [AGENTS.md](../AGENTS.md) を参照。

## 質問・サポート

- プロジェクト固有の疑問: [CLAUDE.md](../CLAUDE.md) + [`.claude/rules/`](../.claude/rules/) を先に読む
- 人間向けセットアップ: [README.md](../README.md)（本ドキュメント）
- 実装パターン・設計の「なぜ」: CLAUDE.md / `.claude/rules/` を参照。ライブラリ API は公式 docs を直接参照
- それでも不明な場合: GitHub Issue（bug / feature template）または owner に直接連絡
