# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム
> デプロイ: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

## コマンド

```bash
bun dev                                       # 開発サーバー
bun run validate                              # type-check → lint（作業中）
bun run validate && bun run build             # 完全検証（コミット前必須）
bun run build:skip-env                        # env 未設定時ビルド
bun run test[:unit|:integration]              # Bun Test（サブディレクトリ別分離実行）
bun run e2e                                   # Playwright
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun prisma/seed.ts                            # Seed
```

保護ファイル（PreToolUse hook で編集拒否）: `.env*` / `bun.lock` / `prisma/migrations/*.sql`

## アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離。遷移はフルページリロード。
管理 write 系は `executeAdminMutationResult`（認証・権限・監査ログ一括処理）。API Route のみ `checkPermission()` 直接使用。

→ 詳細は `.claude/rules/project-structure.md` / `.claude/rules/frontend/project-design-config.md`（パスで自動ロード）

## 技術スタック（非自明な注意点のみ）

| 技術         | 注意点                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16   | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）。Suspense 内 async SC は `await connection()` 必須       |
| React 19.2   | Compiler 1.0 自動メモ化（`useCallback`/`useMemo`/`memo` 不要、例外→`react-patterns.md`）、`use()`、`useEffectEvent`（deps 除外） |
| TypeScript 6 | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                                                                        |
| Prisma 7     | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*`                                                        |
| Tailwind 4.2 | CSS-first `@theme`、セマンティックトークン必須                                                                                   |
| Better Auth  | `adminAuth`/`customerAuth` 完全分離（cookie prefix 別）、RBAC、`generateId: "uuid"` 必須                                         |
| Lexical 0.43 | NodeState API（`$config` + `createState`）                                                                                       |
| nuqs 2.8     | パーサーマップ `@/shared/lib/nuqs`。`useQueryStates({ shallow: false })` で RSC 再レンダリング                                   |

---

## ハードルール（プロジェクト固有）

- **型アサーション（`as`）禁止** — 型ガード・`satisfies`・Zod `safeParse` を使う
- **`useCallback`/`useMemo`/`memo` 禁止** — React Compiler 1.0 が自動メモ化（例外: `useSyncExternalStore` の subscribe 等 → `react-patterns.md`）
- **配列 uniqueness はスキーマ層で契約** — `imageUrls` / `facilities` / `tags` 等は Zod `.refine()` で重複拒否。UI 層の Set dedup は責務逸脱につき禁止。cross-field 重複（`mainImageUrl` ↔ `imageUrls`）も top-level refine で担保（→ `zod-patterns.md`）
- **ハードコードカラー禁止** — セマンティックトークン必須（例外: `global-error.tsx`）
- **`className` テンプレートリテラル禁止** — `cn()` 使用（`@/shared/lib/cn`）
- **認証済みフローに Turnstile 禁止** — 未認証公開フォーム専用（マイページは `verifyCustomerSession` 済み）
- **app 層からの Prisma 直 import 禁止** — `@/shared/db/prisma` は domain/lib 経由のみ（例外: `calendar-sync` `$queryRaw`）
- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須** — スケルトン loading + error boundary

## プロセスルール

- **検証**: 作業中 `bun run type-check`、完了前 `bun run validate`、コミット前 `bun run validate && bun run build`
- **「公式推奨」主張前**: `mcp__context7__query-docs` で一次資料確認（Radix / RHF / Next.js / React）
- **Radix primitives の具体例は context7 取得不可** → `WebFetch` で `https://www.radix-ui.com/primitives/docs/components/<name>` を直接取得（Dialog / NavigationMenu / Popover 等すべて philosophy しか返らない）
- **一括修正後**: Grep で違反パターン残存ゼロを確認してから完了報告
- **アーキテクチャ境界修正後**: `Grep "from \"@/shared/db/prisma\"" src/app/` で app 層直 import 残存ゼロ確認
- **Worktree 作成前**: `git status --short | wc -l` + `ls prisma/migrations/ | tail -1` で未コミット migration 確認、ドリフトあれば先に WIP snapshot commit（→ `gotchas.md` §Worktree）
- **Subagent 規律**: implementer は sonnet 以上（haiku 禁止、report 捏造リスク）/ 完了報告後は `git log --oneline` + `git show --stat HEAD` で独立検証 / 密結合タスクは 1 implementer にバンドル
- **レビューエージェント指摘**: `gotchas.md` と照合して誤報除外（`revalidateTag` 第2引数、Turbopack チャンク重複は頻出誤報）

---

## ワークフロー

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

- **計画作成**: `brainstorming` → `writing-plans`（`docs/plans/YYYY-MM-DD-*.md`）
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`
- **セッション継続時**: `docs/plans/README.md` を確認

## SSOT 定数・シングルトン

| 定数/変数                    | 場所                                 | メモ                                                                   |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `DASHBOARD_ROLES`            | `@/shared/lib/admin-auth`            | ダッシュボードアクセス可能ロール（`verifyAdminSession` と共有）        |
| `adminAuth` / `customerAuth` | `@/shared/lib/{admin,customer}-auth` | cookie prefix 分離。顧客は Google/LINE、`basePath: /api/customer-auth` |
| `prisma` / `basePrisma`      | `@/shared/db/prisma`                 | `basePrisma` は Better Auth アダプター専用（`$extends` 前）            |
| `CACHE_TAGS` / `getCacheTag` | `@/shared/lib/constants`             | `CACHE_TAGS.SETTINGS` は廃止済 → 個別タグ使用                          |
| `CACHE_LIFE`                 | `@/shared/lib/constants`             | `cacheLife` プリセット                                                 |
| `NOTIFICATION_TYPE`          | `enums/helpers`                      | DB VARCHAR 管理、`isValidNotificationType` 型ガード付き                |

---

## 自動ロード

- **`.claude/rules/**/\*.md`** — `paths:`フロントマターで条件付き自動ロード。最重要は`gotchas.md`
- **`.claude/skills/`** — Skill ツールの起動時 system message で description 露出、カタログ不要
- **`.claude/agents/`** — Agent ツールの `subagent_type` パラメータで一覧提示、カタログ不要

包括的監査が必要な場合は、該当 subagent を並列起動する（Agent ツール経由で description を参照して選択）。
