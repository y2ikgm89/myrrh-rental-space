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

変更を証明できる最小のコマンドを選ぶ: schema 変更 → `db:generate` + 該当テスト、
section/registry 変更 → architecture-boundaries テスト、UI のみの変更 →
`lint-format` + 該当 unit テスト。完了報告前に `bun run validate` を必ず実行し、
テスト対象のロジックを変更した場合・該当テストファイルを編集した場合のいずれでも
該当テストを実行する。コミット前は `bun run validate && bun run build`。

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
10. 日付表示は `src/shared/lib/date-format.ts` の JST 固定 formatter を使う
    （date-fns `format()` 直呼びが UTC ずれを起こす理由は business-domain ルール参照）
11. **main への push = 即・本番デプロイ**。DROP/RENAME を含む migration は自動で
    計画ダウンタイム付きデプロイに切り替わる
12. 秘密値（`.env*` の実値）は出力・コピー・コミットしない

## 自動完遂ポリシー

タスクが完了点に達したら、ユーザー確認なしで commit → push → PR → **auto-merge 予約**まで自動進行し
**即次タスクに移る**。CI watch では blocking しない（GitHub 側の required checks pass 時点で自動
squash merge）。「進めて」等の明示承認は**不要**。gate はいずれか該当で停止する。

| Gate            | 内容                                                                          | 該当/fail 時             |
| --------------- | ----------------------------------------------------------------------------- | ------------------------ |
| 1. branch       | main 直編集なら `<type>/<topic>` へ切替                                       | 自動切替                 |
| 2. 停止例外     | 下記の停止例外に該当しないか scan                                             | 該当すれば停止           |
| 3. 検証         | `bun run validate && bun run build` exit 0                                    | 停止                     |
| 4. commit       | 明示ファイル指定 + Conventional Commits + Co-Authored-By                      | 停止                     |
| 5. push         | `git push -u origin <branch>`（lefthook pre-push 通過）                       | 停止                     |
| 6. PR           | `gh pr create --base main`（Summary + Test plan）                             | 停止                     |
| 7. auto-merge   | `gh pr merge --auto --squash --delete-branch` 予約 → 即次タスク               | 停止                     |
| 8. CI fail 検知 | 通知 or 次セッション開始時の `gh pr list` で検出                              | root cause fix → 再 push |
| 9. sync         | 次セッション開始時 or 明示 `git pull --ff-only`。gone branch は `/clean_gone` | -                        |

**PR 粒度**: 1 PR = 1 logical change、soft limit 300 行 / 10 file。同一 file の fix-of-fix で対象 PR が
まだ未 merge なら新規 PR を作らず同 branch に追加 commit（push 前に `gh pr view <N> --json state` で
OPEN を確認 — auto-merge 済みなら新 branch）。独立 topic / 別 domain は別 PR。

**停止例外**（該当時はユーザーに確認する）:

- breaking schema（`DROP COLUMN` / 型 narrowing / required 化 / table rename）
- `.env*` 編集・新規 env 変数・`bun.lock` の予期せぬ変更
- 20 file 超 / 1000 行超 / 既存 `prisma/migrations/*.sql` を含む大規模変更
- 当該タスクと無関係な untracked / modified が存在する（並行セッションの可能性）
- destructive 操作（`reset --hard` / `migrate reset` / `--no-verify` / hook bypass / `branch -D`）
- 機密情報混入の疑い・test fail・過去 60 分で PR 3 件超の自動 merge（暴走 detect）
- ユーザーが調査・相談・brainstorming 中で実装の明示指示がない

「コミットしないで」「step by step で」「PR 作らないで」等の明示指示があれば override して即停止する。

**事故防止の実体**（Claude Code hooks + lefthook + GitHub branch protection の三層防御）:

| 層                       | 内容                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code PreToolUse   | `.claude/hooks/`: git commit/push の timeout 不足を deny、既存 migration.sql・`.env*` の編集をガード、main/master への force push を deny、reset --hard・migrate reset・db push/pull・--no-verify 等も deny（ask は permission_mode: bypassPermissions 下で無効化されるため不採用、実地検証済み） |
| pre-commit               | eslint-fix + prettier-fix + `scripts/check-protected-files.sh`（並列）                                                                                                                                                                                                                            |
| pre-push                 | `type-check` → `architecture-boundaries.test.ts` を直列実行                                                                                                                                                                                                                                       |
| commit-msg               | `scripts/check-commit-msg.sh` で Conventional Commits 強制                                                                                                                                                                                                                                        |
| GitHub branch protection | main、required checks 7 件・force-push 禁止・branch 削除禁止・`strict: false`                                                                                                                                                                                                                     |

## 詳細ルール

トピック別の規約は `.claude/rules/`（対象ファイルを読むと自動ロード）、
複数ステップの定型作業は `.claude/skills/`（`/prisma-migration` 等で呼び出し）にある。
