# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム
> デプロイ: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

## コマンド

```bash
bun dev                                       # 開発サーバー（Turbopack）
bun run validate                              # type-check → lint（作業中）
bun run validate && bun run build             # 完全検証（コミット前必須）
bun run build:skip-env                        # env 未設定時ビルド
bun run analyze                               # Turbopack-native bundle 解析（.next/diagnostics/analyze に出力）
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual --update-snapshots  # visual regression baseline 生成
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual                     # visual regression diff 検証
bun run lhci                                  # Lighthouse CI（perf/a11y/SEO/best-practices スコア検証）
bun run test:unit                             # 単体テスト
bun run test:integration                      # 統合テスト
bun run test:all                              # 単体 + 統合（順次実行）
bun run e2e                                   # Playwright E2E（認証済みテストは e2e/authenticated/{admin,customer}/*.spec.ts 配置必須 — chromium-{admin,customer} project の testMatch 一致）
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun run db:seed                               # Seed
```

保護ファイル（PreToolUse hook で編集拒否）: `.env*` / `bun.lock` / `prisma/migrations/*.sql`

## アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離。遷移はフルページリロード。
管理 write 系は `executeAdminMutationResult`（認証・権限・監査ログ一括処理）。API Route のみ `checkPermission()` 直接使用。

公開コンテンツ一覧: `/posts`（ブログ）、`/news`（お知らせ）、`/spaces`、`/events`、`/faq`。`/journal` は廃止済み。RSS: `/feed.xml`。

→ 詳細は `.claude/rules/project-structure.md` / `.claude/rules/frontend/project-design-config.md`（パスで自動ロード）

## 技術スタック（非自明な注意点のみ）

| 技術         | 注意点                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16   | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）。Suspense 内 async SC は `await connection()` 必須                              |
| React 19.2   | Compiler 1.0 自動メモ化（`useCallback`/`useMemo`/`memo` 不要、例外→`react-patterns.md`）、`use()`、`useEffectEvent`（deps 除外）                        |
| TypeScript 6 | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                                                                                               |
| Prisma 7     | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*`                                                                               |
| Tailwind 4.2 | CSS-first `@theme`、セマンティックトークン必須                                                                                                          |
| Better Auth  | `adminAuth`/`customerAuth` 完全分離（cookie prefix 別）、RBAC、`generateId: "uuid"` 必須                                                                |
| Zod 4        | `.merge()` deprecated（→ `.extend(schema.shape)`）。`.refine()` 後は `.omit()` 不可（→ base/refine 分離）。`error:` パラメータ必須（`message:` 非推奨） |
| Lexical 0.43 | NodeState API（`$config` + `createState`）                                                                                                              |
| nuqs 2.8     | パーサーマップ `@/shared/lib/nuqs`。`useQueryStates({ shallow: false })` で RSC 再レンダリング                                                          |

---

## ハードルール（プロジェクト固有）

- **型アサーション（`as`）禁止** — 型ガード・`satisfies`・Zod `safeParse` を使う
- **`useCallback`/`useMemo`/`memo` 禁止** — React Compiler 1.0 が自動メモ化（例外: `useSyncExternalStore` の subscribe 等 → `react-patterns.md`）
- **配列 uniqueness はスキーマ層で契約** — `imageUrls` / `facilities` / `tags` 等は Zod `.refine()` で重複拒否。UI 層の Set dedup は責務逸脱につき禁止。cross-field 重複（`mainImageUrl` ↔ `imageUrls`）も top-level refine で担保（→ `zod-patterns.md`）
- **ハードコードカラー禁止** — セマンティックトークン必須（例外: `global-error.tsx`）
- **`className` テンプレートリテラル禁止** — `cn()` 使用（`@/shared/lib/cn`）
- **Turnstile 配置基準** — 未認証公開フォームは必須。認証済みフローでも可逆性が低い高リスク操作（予約作成/変更/キャンセル、決済関連等）には許容。ログイン直後の参照系や低リスク操作（プロフィール閲覧等）には不要
- **app 層からの Prisma 直 import 禁止** — `@/shared/db/prisma` は domain/lib 経由のみ（例外: `calendar-sync` `$queryRaw`）。Prisma enum / `Prisma` 名前空間も `@/shared/lib/validations/enums/prisma-types` ゲートウェイ経由（直 `@generated/prisma/*` 禁止、`shared/db` / `shared/domain` / `shared/lib/validations/enums` 自身のみ例外。`architecture-boundaries.test.ts` で検出）
- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須** — スケルトン loading + error boundary
- **ステータスラベル・公開状態ラベルのハードコード禁止** — `enums/helpers.ts` の `*_STATUS_LABELS` / `PUBLISH_LABELS` / `AUDIT_ACTION_LABELS` を参照。`status-badges.tsx` の config も SSOT label を参照する。新規 enum 追加時は `*_LABELS` 定数も同時追加
- **server-only チェーン内の定数を Client Component から import 禁止** — client-safe ファイルに分離して server-only モジュールが re-export するパターンを使う（`admin-roles.ts` / `admin-resources.ts` 参照）
- **管理画面のアクションボタン（新規作成等）はページヘッダー右端に配置** — タブ行内配置禁止。タブ別にボタンが変わる場合はラベルを明示して分岐（`spaces/page.tsx` `HeaderAction` 参照）
- **enum 依存の条件フィールドは `useWatch` + 条件レンダリング** — `customerType === CORPORATE` で会社名表示等。切替時に `setValue("field", "")` + `form.clearErrors("field")` でクリア。公開フォーム・管理フォーム・マイページで同一パターンを適用（`contact-form.tsx` / `CustomerForm.tsx` / `profile-form.tsx` 参照）

## プロセスルール

- **検証**: 作業中 `bun run type-check`、完了前 `bun run validate`、コミット前 `bun run validate && bun run build`
- **`test:unit` / `test:integration` は per-directory バッチ**（`package.json` 参照）— `bun test __tests__/unit` / `bun test --coverage` 単一実行への簡略化禁止（`mock.module` グローバル干渉で偽陽性失敗）。**CI も対象** — `.github/workflows/ci.yml` unit-tests job は `bun run test:unit && bun run test:integration` のみ許可（→ ADR 0010）。新規テストディレクトリ追加時は `package.json` の `test:unit` / `test:integration` チェーンにも追記
- **`.claude/rules/frontend/{lexical,admin-inline-editor}-patterns.md` 編集後**: `node scripts/verify-policy-docs.mjs` 実行必須。`docs/reference/codex-rules/*.md` と byte-identical ドリフトは `policy-docs-sync` CI job の blocker（→ ADR 0013）
- **「公式推奨」主張前**: `mcp__context7__query-docs` で一次資料確認（Radix / RHF / Next.js / React / Prisma / Zod）。半端な修正で終わらせず、generator entry の実装ファイル（`generated/prisma/internal/*` 等）まで読む
- **Radix primitives の具体例は context7 取得不可** → `WebFetch` で `https://www.radix-ui.com/primitives/docs/components/<name>` を直接取得（Dialog / NavigationMenu / Popover 等すべて philosophy しか返らない）
- **一括修正後**: Grep で違反パターン残存ゼロを確認してから完了報告
- **アーキテクチャ境界修正後**: `Grep "from \"@/shared/db/prisma\"" src/app/` で app 層直 import 残存ゼロ確認
- **Worktree 作成前**: `git status --short | wc -l` + `ls prisma/migrations/ | tail -1` で未コミット migration 確認、ドリフトあれば先に WIP snapshot commit（→ `gotchas.md` §Worktree）
- **Prisma 7.7 CLI フラグ変更**: `migrate diff --to-schema-datamodel` → `--to-schema`、`--shadow-database-url` 削除、`db execute --schema` 削除。非対話環境での destructive migration は「schema 編集 → `mkdir prisma/migrations/<ts>_<name>` → `migration.sql` 手書き → `db execute --file` → `migrate resolve --applied <name>`」の順（→ `gotchas.md` §Prisma Migrate）
- **Prisma enum 新規追加は 8 箇所同時更新**: ① `schema.prisma` + migration ② `enums/prisma-types.ts` re-export ③ `enums/guards.ts` 型ガード ④ `enums/helpers.ts` ラベル + getValid + parseFilter ⑤ validation スキーマ（`z.enum(NewEnum)`）⑥ domain types + queries（全 select に追加）+ commands ⑦ Server Actions + 公開フォーム ⑧ 管理 UI（Detail 表示 + Form フィールド）+ seed + テスト。密結合の①〜③は 1 implementer にバンドル
- **Subagent 規律**: implementer は sonnet 以上（haiku 禁止、report 捏造リスク）/ 完了報告後は `git log --oneline` + `git show --stat HEAD` で独立検証 / 密結合タスクは 1 implementer にバンドル
- **レビューエージェント指摘**: `gotchas.md` と照合して誤報除外（`revalidateTag` 第2引数、Turbopack チャンク重複、JSX IIFE 算術式偽陽性 `((a/b)*10)/10`、「実装済みだが欠落報告」`select.tsx` required 等）。`bun run lint` exit 状態 + Read による source 直接確認を ground truth とする
- **監査エージェント指摘**: 違反報告後、該当 rule ファイル（`react-patterns.md` / `lexical-patterns.md` / `type-safety.md` 等）の「例外」節と必ずクロスリファレンスする。`useSyncExternalStore` subscribe の `useCallback`、Lexical fork、`as Prisma.InputJsonObject` 等は documented exception
- **SSoT 重複検出の grep**: symbol 名（`ROLE_LABELS` 等）だけでなく **literal 文字列**（`"スーパー管理者"` 等）でも再 grep 必須。狭い正規表現（`ROLE_LABELS.*=\s*{$`）は同一行に開き波括弧がないと見落とす
- **SSoT ラベル監査の網羅チェック**: 全 enum の日本語ラベル（`"保留中"` / `"公開中"` / `"下書き"` / `"未払い"` 等）を `_components/` + `_shared/` 配下で grep し、SSOT 定数以外のヒットがゼロであることを確認。`status-badges.tsx` / `*Filters.tsx` / `*Form.tsx` / `*Detail.tsx` / `*-helpers.ts` が典型的な重複箇所
- **大規模監査の前提**: `bun run validate` が exit 0 なら compiler/linter 基準ではクリーン。監査で大量違反が報告されたら先行実行して基準合わせる
- **公開一覧ページ新設時**: ① `page.tsx` + `loading.tsx` + `error.tsx` ② `generatePageMetadata(slug)` + `BreadcrumbJsonLd` ③ `getPageSectionsWithFallback(slug)` で hero/trailing sections ④ trailing sections から同種セクション（`post-list` 等）+ `cta` を除外 ⑤ `default-page-sections.ts` + `page.ts` SYSTEM_PAGES にスラッグ追加 ⑥ seed.ts の Page レコード ⑦ sitemap.ts 確認 ⑧ ナビゲーション（seed NavigationItem）確認 ⑨ E2E fixtures の urls 追加 ⑩ layout.tsx の RSS `alternates` 追加（該当時）

---

## ワークフロー

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

- **計画作成**: `brainstorming` → `writing-plans`（`docs/plans/YYYY-MM-DD-*.md`）。意図が明確な場合は brainstorming Q&A スキップ → 設計提案 → 承認 → writing-plans 直行可
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`
- **セッション継続時**: `docs/plans/README.md` を確認

## SSOT 定数・シングルトン

| 定数/変数                                                                                                                      | 場所                                          | メモ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_ROLES` / `STAFF_INVITABLE_ROLES` / `ROLE_LABELS` / `ROLE_DESCRIPTIONS` / `isDashboardRole()` / `type DashboardRole` | `@/shared/lib/admin-roles`                    | **client-safe** Role SSoT。`admin-auth.ts`（server-only）が `DASHBOARD_ROLES` を再 export。`z.enum(DASHBOARD_ROLES)` 直接利用可。tuple 型のため `.includes()` ではなく `isDashboardRole()` 型ガード必須                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `adminAuth` / `customerAuth`                                                                                                   | `@/shared/lib/{admin,customer}-auth`          | cookie prefix 分離。顧客は Google/LINE、`basePath: /api/customer-auth`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `prisma` / `basePrisma`                                                                                                        | `@/shared/db/prisma`                          | `basePrisma` は Better Auth アダプター専用（`$extends` 前）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `CACHE_TAGS` / `getCacheTag`                                                                                                   | `@/shared/lib/constants`                      | `CACHE_TAGS.SETTINGS` は廃止済 → 個別タグ使用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `CACHE_LIFE`                                                                                                                   | `@/shared/lib/constants`                      | `cacheLife` プリセット                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `FaqItem.answer`                                                                                                               | `prisma/schema.prisma`                        | **プレーンテキスト単一列**（`@db.Text`）。SEO/OGP 項目も廃止済（/faq 一覧ページ単位の Page SEO のみ）。管理画面は master-detail 構成（`/admin/faq` カテゴリ一覧 → `/admin/faq/[categoryId]` 詳細）、質問 CRUD は `FaqItemDialog`、カテゴリ CRUD は `FaqCategoryDialog`。公開は `whitespace-pre-wrap`。Lexical 本文は Post/News/Terms/Section のみ                                                                                                                                                                                                                                                                                                 |
| `NOTIFICATION_TYPE`                                                                                                            | `enums/helpers`                               | DB VARCHAR 管理、`isValidNotificationType` 型ガード付き                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `*_STATUS_LABELS` / `AUDIT_ACTION_LABELS` / `PUBLISH_LABELS` / `getPublishLabel()`                                             | `enums/helpers`                               | 全ステータス enum + boolean publish のラベル SSoT。`CUSTOMER_STATUS_LABELS` / `CUSTOMER_TYPE_LABELS` / `INQUIRY_STATUS_LABELS` / `POST_STATUS_LABELS` / `TERMS_STATUS_LABELS` / `EDITOR_COMMENT_STATUS_LABELS` / `RESERVATION_ACTION_LABELS` 含む。UI でラベルをハードコードしない — 必ず SSoT 定数を参照                                                                                                                                                                                                                                                                                                                                         |
| `Resource` / `Action` / `RESOURCE_LABELS`                                                                                      | `@/admin/lib/admin-resources`                 | **client-safe** Resource SSoT。`permissions.ts`（server-only チェーン）が re-export。`admin-roles.ts` ↔ `admin-auth.ts` と同じ分離パターン                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Prisma` 型 / Prisma enums (`Role` / `ReservationStatus` / `EventStatus` 等 34 種)                                             | `@/shared/lib/validations/enums/prisma-types` | **client-safe** Prisma gateway。`Prisma` 名前空間は `export type { Prisma } from "@generated/prisma/browser"` で **型のみ** 再 export（`Prisma.WhereInput` / `InputJsonValue` 等）。enums は値再 export。**runtime sentinel 値 (`Prisma.JsonNull` / `DbNull` / `join` / `sql` / `raw`) は gateway から取得不可** — `shared/db/` / `shared/domain/` が `@generated/prisma/client` から直接 import する（browser entry と client entry は内部 runtime が異なり、sentinel が別オブジェクトになる identity 問題のため）。`PrismaClient` クラスは `shared/db/prisma.ts` のみで生成。`architecture-boundaries.test.ts` で gateway の値 re-export を禁止 |

---

## 自動ロード

- **Rules**: `.claude/rules/**/*.md` — `paths:` フロントマターで条件付き自動ロード。最重要は `gotchas.md`
- **Skills**: `.claude/skills/<name>/SKILL.md` は検出用スタブ（description のみ）。手順の正本は `.agents/skills/<name>/SKILL.md` に置く（`stripe-debug` / `cloud-run-debug` 参照）
- **Subagents**: `.claude/agents/<name>.md` — frontmatter は `name` / `description` / `tools:`（最小権限）/ `model: sonnet` / `memory: project`（`security-reviewer.md` / `zod-schema-reviewer.md` 参照）
- **Memory**: `~/.claude/projects/<slug>/memory/MEMORY.md` がセッション開始時に自動ロード（プロジェクト固有の継続コンテキスト・過去 PR/ブランチ履歴の索引）

包括的監査が必要な場合は、該当 subagent を並列起動する（Agent ツール経由で description を参照して選択）。
