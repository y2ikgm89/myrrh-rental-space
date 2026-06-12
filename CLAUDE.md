# Myrrh Rental Space — Claude Code 指示書

レンタルスペースの予約・問い合わせと運用管理画面を備えた Next.js 16 / App Router アプリ。公開サイト `(public)` と管理ダッシュボード `(admin)` を単一プロジェクトで提供する。

詳細な領域別ルールは `.claude/rules/` にあり、対象ファイルを編集するときだけ自動でコンテキストに読み込まれる。

## 開発コマンド（`package.json` の scripts が SSoT）

- `bun run validate` — type-check ＋ lint。**完了報告・コミット前に必ず通す**
- `bun run build` — 本番ビルド。**コミット前は validate と併せて実行**
- `bun run dev` — 開発サーバー（Turbopack）。**手動管理。Claude から起動・kill しない**
- `bun run type-check` / `bun run lint` / `bun run format`
- `bun run test:unit` / `bun run test:integration` / `bun run e2e`
- `bun run db:migrate`（開発マイグレーション）/ `bun run db:generate` / `bun run db:studio`

パッケージ管理・スクリプト実行は **Bun** のみ（`npm` / `yarn` / `pnpm` は使わない）。

## 環境

- Windows + PowerShell。シェルコマンドは PowerShell 構文（`$null`、`$env:VAR`）。
- tool に渡すパスは常にフォワードスラッシュ `/`。route group の `()` を含むパス（`src/app/(public)/...`）は Bash で展開されるため Glob / Grep / Read tool を使う。
- 秘密情報は `.env.local`（gitignore）。`.env*` は読まない・コミットしない。

## アーキテクチャ

- `src/app/(public)/` 公開サイト / `src/app/(admin)/` 管理画面 / `src/app/api/` route handler（cron・webhook）
- `src/shared/` 横断層: `db/`（Prisma gateway）/ `domain/`（ビジネスロジック）/ `lib/`（UI・validation・定数）/ `components/`
- パスエイリアス: `@/shared/*` `@/admin/*` `@/public/*` `@generated/*`
- 依存方向: `shared` は `(admin)` / `(public)` を import しない（下層は上層に依存しない）

## コア規約（全コードに常時適用。詳細・例は path-scoped rules 参照）

- **Prisma は gateway 経由のみ** — `new PrismaClient` は `src/shared/db/prisma.ts` だけ。利用側は `import { prisma } from "@/shared/db/prisma"`。
- **DB query / command は先頭で `import "server-only";`** — `src/shared/domain/<entity>/{queries,commands}.ts` に置く。
- **公開サイトは `@/shared/domain` 経由でのみ DB アクセス** — `(public)` から `@/shared/db*` を import しない（ESLint error）。
- **React Compiler 前提** — `useMemo` / `useCallback` / `forwardRef` は使わない（ref は通常 prop）。ESLint error。
- **cache タグ直書き禁止** — `CACHE_TAGS` / `getCacheTag`（`src/shared/lib/constants/cache.ts`）を使う。
- **`prisma.$transaction([...])` 配列形式禁止** — `Promise.all` か interactive `$transaction(async (tx) => {})`。
- **管理画面の mutation は `executeAdminMutationResult`（`@/admin/lib/admin-action`）を経由** — auth → 権限 → execute → cache 無効化 → 監査の順を手書きしない。

## TypeScript

`strict` ＋ `noUncheckedIndexedAccess` ＋ `exactOptionalPropertyTypes` ＋ `verbatimModuleSyntax` ＋ `erasableSyntaxOnly`。`enum` / `namespace` / parameter property は使えない（`erasableSyntaxOnly`）。型は推測せず実型に合わせる。

## コミット・PR

- Conventional Commits（`feat:` `fix:` `refactor:` `docs:` 等）。`commit-msg` hook が検証。
- pre-commit（lefthook）が staged を ESLint `--fix` / Prettier 整形。pre-push で type-check ＋ architecture-boundaries テスト。
- `--no-verify` は使わない。1 PR = 1 論理変更。
