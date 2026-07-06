# CLAUDE.md

レンタルスペース予約サイト。公開サイトと管理画面を単一リポジトリで開発し、
`APP_SURFACE` 環境変数で public / admin の 2 つの Cloud Run サービスに分離デプロイする。

## スタック

- Bun 1.3.14（`packageManager` が SSoT）/ TypeScript 6.0.3（exact pin）
- Next.js 16 App Router（`cacheComponents: true` = PPR + `"use cache"`、React Compiler、typedRoutes）
- React 19 / Prisma 7 + PostgreSQL 16（client は `generated/prisma` に生成、git 管理外）
- Tailwind v4 CSS-first（`tailwind.config.*` なし）/ conform + Zod 4 / Better Auth（顧客のみ）
- テスト: bun test（`scripts/run-tests.ts` 経由必須）+ Playwright

## コマンド

| コマンド                                        | 用途                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| `bun run dev`                                   | 開発サーバー（prisma generate 込み）           |
| `bun run validate`                              | **type-check + lint のみ**。テストは含まれない |
| `bun run test:unit`                             | unit テスト（per-file 隔離 runner 経由）       |
| `bun run test:integration`                      | 統合テスト（test DB を自動起動・migrate）      |
| `bun scripts/run-tests.ts <path>`               | 単一ファイル/ディレクトリのテスト実行          |
| `bun run build`                                 | 本番ビルド（実 env 検証あり）                  |
| `bun run build:skip-env`                        | placeholder env でのビルド検証（DB 不要）      |
| `bun run db:generate`                           | Prisma client 再生成（schema 変更後に必須）    |
| `bun run db:migrate --name <name>`              | migration 作成・適用                           |
| `bunx playwright test --project=chromium-smoke` | smoke E2E（CI required gate と同一）           |
| `bun run lint-format`                           | ESLint + Prettier チェック（CI と同一入口）    |

変更を証明できる最小のコマンドから実行する。完了報告前に `bun run validate` を必ず実行し、
テストに触れた場合は該当テストも実行する。コミット前は `bun run validate && bun run build`。

`git push` は lefthook の pre-push hook（`type-check` → `architecture-boundaries` テストを
**直列実行**、実測合計 80〜110 秒）を待つ。`git push` / `git commit` をツール経由で実行する
場合はタイムアウトを 180 秒以上（推奨 300 秒）確保する。

## 構造

- `src/app/(public)` / `src/app/(admin)` — **Multiple Root Layouts**（それぞれ独自の `<html>`）。
  相互遷移はフルページリロード（仕様）
- `src/shared/domain/*` — 再利用サーバーロジック（Prisma を触るのはここと `src/shared/db` のみ）
- `src/shared/db/*` — Prisma client gateway / `src/shared/lib/*` — 純粋ヘルパー・横断基盤
- `__tests__/unit` + `__tests__/integration`（bun）/ `e2e/`（Playwright、`*.spec.ts`）
- path alias: `@/shared/*` → `src/shared/*`、`@/admin/*` → `src/app/(admin)/admin/(dashboard)/_shared/*`、
  `@/public/*` → `src/app/(public)/_shared/*`、`@generated/*` → `generated/*`

## 絶対規約

アーキテクチャ規約の多くは `__tests__/unit/architecture-boundaries.test.ts` と ESLint が
機械強制する。**lint が緑でも unit テストで落ちる規約がある**（危険 cast の grep gate 等）。

1. **テストは必ず `scripts/run-tests.ts` 経由**で実行する。素の `bun test <dir>` は
   `mock.module()` のプロセス汚染と Lexical の TDZ violation で壊れる
2. `bun run validate` はテストを含まない。「テスト緑」は test コマンドの実出力でのみ主張する
3. Prisma は `@/shared/db/prisma` からのみ import し、import するファイルは
   `import "server-only"` 必須。`src/app/*` から Prisma・`@generated/prisma` の直 import 禁止
   （enum は `@/shared/lib/validations/enums/prisma-types` 経由）
4. `cacheComponents: true` のため route segment config（`export const dynamic` 等）は全面禁止。
   動的化は `await connection()` で行う
5. キャッシュタグの文字列直書き禁止。`CACHE_TAGS` / `getCacheTag`（Next.js 側）、
   `CDN_CACHE_TAGS` / `joinCacheTags`（Cloudflare 側）を経由する
6. `any` 系・non-null assertion（`!`）・`@ts-ignore`・危険 cast は grep gate で 0 件強制
7. 既存の `prisma/migrations/*/migration.sql` は編集禁止（pre-commit がブロック）。
   修正は新規 migration の追加で行う
8. 予約・イベントの空き/定員に関わる書込は `prisma.$transaction` 内で advisory lock
   （`lockReservationSpaceForTransaction` 等）を重複チェックより先に取得する
9. `TermsAgreement` と `AuditLog` は append-only の証跡レコード（update/delete 禁止）
10. 日付表示は `src/shared/lib/date-format.ts` の JST 固定 formatter を使う。
    date-fns `format()` 直呼びはサーバー UTC で 9 時間ずれる
11. **main への push = 即・本番デプロイ**。DROP/RENAME を含む migration は自動で
    計画ダウンタイム付きデプロイに切り替わる
12. 秘密値（`.env*` の実値）は出力・コピー・コミットしない

## 詳細ルール

トピック別の規約は `.claude/rules/`（対象ファイルを読むと自動ロード）、
複数ステップの定型作業は `.claude/skills/`（`/prisma-migration` 等で呼び出し）にある。
