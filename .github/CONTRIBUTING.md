# Contributing to Myrrh Rental Space

このドキュメントは開発者向けのクイックスタートです。ハードルールの正本は散文ではなく
**CI で強制される gate**（`eslint.config.mjs` / `__tests__/unit/architecture/**` /
`.github/workflows/ci.yml`）です。

## 開発環境セットアップ

### 前提ソフトウェア

- **Bun** — `package.json#packageManager` で固定。`bun upgrade` で揃える
- **Node.js** 20+ — 一部 CLI ツール
- **PostgreSQL** 18 — ローカル DB（Docker Compose 推奨。本番 Neon / CI と同一系）
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
# ENCRYPTION_KEY は管理画面のシークレット保存（暗号化）に必要。空なら
# `bun run setup` が自動生成する。AUDIT_LOG_HMAC_KEY と Cloudflare 本番トークンは
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

**Trunk-based development** を採用しています（本番反映だけは手動 dispatch）。

```
main                       ← リリース対象（本番反映は手動 dispatch。マージでは deploy されない）
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

# E2E（production `next start`。既存サーバーは再利用しない）
bun run e2e

# E2E（特定 project）
bunx playwright test --project=chromium-customer
```

**注意**:

- 素の `bun test <path>` は禁止。必ず `bun scripts/run-tests.ts` または `bun run test --` を使う
- ディレクトリ指定は**可**（runner が再帰展開し、1 ファイル 1 サブプロセスで走らせるので `mock.module` のプロセス汚染は起きない）。走らせ方の正本は [`.claude/rules/testing.md`](../.claude/rules/testing.md)
- フル実行を毎回行う必要はない。lefthook pre-push と CI が自動で守る
- Coverage は per-directory batch と非互換のため CI ゲートなし
- `bun run e2e` は既存サーバーを再利用しない。手動起動中の `bun run dev` が 3000 を占有していると必ず落ちる
- 既定の `APP_SURFACE` は `admin`。公開 root / mobile は `APP_SURFACE=public` で再実行する（CI と同じ）

### 4. PR 作成

```bash
git checkout -b feature/my-feature
# 実装・コミット
gh pr create
```

PR template（[`pull_request_template.md`](./pull_request_template.md)）を埋めてください。

## 品質ゲート

CI で実行される必須 / opt-in job の定義は [`.github/workflows/`](./workflows) が SSoT。重い job は `workflow_dispatch` の `run_full_ci=true` で任意ブランチから起こせる（`gh workflow run ci.yml --ref <branch> -f run_full_ci=true`）。**同じ job 群は main の nightly schedule でも自動実行される。** どの job がどちらで起動するかは `ci.yml` の `if:` が正本なので、ここでは列挙しない。

## セキュリティ

脆弱性を発見した場合は **公開 issue を開かず** [`SECURITY.md`](./SECURITY.md) の指示に従って報告してください。

## ハードルール

ハードルールの SSoT は [`eslint.config.mjs`](../eslint.config.mjs) と
[`__tests__/unit/architecture/`](../__tests__/unit/architecture/) の gate 群です。
本 CONTRIBUTING には複製しません（drift 防止）— 散文で書くと必ず実装からずれるため、
「守らせたい規約は gate にする」のがこのリポジトリの方針です。

## 質問・サポート

- プロジェクト固有の疑問: 該当 gate（`__tests__/unit/architecture/**`）の冒頭 JSDoc を先に読む
- 人間向けセットアップ: [README.md](../README.md)
- 運用手順・本番セットアップ・ADR: [docs/README.md](../docs/README.md)（現行の手順と日付入りの記録の見分け方もここ）
- 実装パターン・設計の「なぜ」: 各モジュール冒頭の JSDoc を参照。ライブラリ API は公式 docs を直接参照
- それでも不明な場合: GitHub Issue（bug / feature template）または owner に直接連絡
