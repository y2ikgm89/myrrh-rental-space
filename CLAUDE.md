# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム

## コマンド

```bash
bun dev                                       # 開発サーバー
bun run validate                              # type-check → lint
bun run validate && bun run build             # 完全検証（コミット前必須）
bun run build:skip-env                        # env未設定時ビルド
bun run test                                  # 全テスト（39バッチ分離実行）
bun run test:unit                             # Unit テストのみ
bun run test:integration                      # Integration テストのみ
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun prisma/seed.ts                            # Seed
bun run e2e                                   # E2E テスト（Playwright）
```

> **フック**: Prettier + ESLint --fix（PostToolUse）/ schema-change-guard / type-check-on-stop
> **保護**: `.env*`, `bun.lock`, `prisma/migrations/*.sql` 編集不可（PreToolUse）
> **デプロイ**: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

## アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離。遷移はフルページリロード。

```
src/app/(admin)/admin/(dashboard)/   管理画面（admin.css, Better Auth）
src/app/(public)/                    公開ページ（Page-First Architecture, Editorial Magazine）
src/shared/domain/                   ドメイン層（commands + admin/public/customer-queries）
src/shared/lib/sections/             セクションレジストリ・定義
generated/prisma/                    Prisma Client（.gitignore対象）
__tests__/                           unit/ + integration/（39バッチ分離実行）
```

公開ページ: Editorial Magazine（Kinfolk/Cereal）— シャープエッジ、serif/sans 対比、bronze accent ≤10% → `project-design-config.md`
レスポンシブ: Fluid-first（`clamp()`）+ Container Queries。Viewport breakpoints はマクロレイアウト切替のみ。

## 技術スタック（非自明な注意点のみ）

| 技術         | 注意点                                                                    |
| ------------ | ------------------------------------------------------------------------- |
| Next.js 16   | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）   |
| React 19     | Compiler 1.0 自動メモ化（`useCallback`/`useMemo`/`memo` 不要）、`use()`   |
| TypeScript 6 | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                 |
| Prisma 7     | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*` |
| Tailwind 4   | CSS-first `@theme`、セマンティックトークン必須                            |
| Better Auth  | RBAC, Google/LINE OAuth, `generateId: "uuid"` 必須                        |

---

## 禁止（違反禁止）

### 型・コード品質

- **型アサーション（`as`）禁止** → `type-safety.md`
- **className テンプレートリテラル禁止** → `cn()` 使用必須（`@/shared/lib/cn`）。例外: layout.tsx のフォント変数
- **純 CSS コンポーネントへの `"use client"` 禁止** → state/effect/browser API がなければ Server Component
- **後方互換性ハック禁止** → 不要コード完全削除

### Server Actions・キャッシュ

- **`'use cache'` 関数での直接 prisma 呼び出し禁止** → `safeFetch` + `toPlainObject`/`toPlainArray` 必須 → `server-actions.md`
- **公開 Server Action のレート制限省略禁止** → 全公開 mutation に `checkActionRateLimit(formSubmitRateLimiter)` → `server-actions.md`
- **公開 Server Action の Turnstile 省略禁止** → 全公開 write mutation に `validateTurnstile` 必須（認証済みユーザー含む、マイページから呼ぶ共有アクションも対象）
- **公開 Server Action の ID 引数バリデーション省略禁止** → `z.string().uuid()` で検証
- **キャッシュ無効化漏れ禁止** → 顧客統計が変わる操作は `CUSTOMERS` + `customers.detail(id)` 必須。アカウント削除は関連全タグ無効化 → `gotchas.md` §Cron / Webhook
- **ソフトデリート `where` 漏れ禁止** → 全クエリに `deletedAt: null`、リレーション経由も親ガード必須 → `gotchas.md` §ドメイン・予約

### 公開ページ UI

- **公開ページのカード背景に `bg-surface` 禁止** → `border border-border` のみ（Editorial: 背景色なし + ボーダーで分離）
- **ブラウザネイティブ `confirm()`/`alert()` 禁止** → Radix Dialog + インライン `role="alert"` エラー表示を使用
- **ハードコードカラー禁止** → Tailwind クラス・インラインスタイル両方対象。例外: `global-error.tsx` → `tailwind-patterns.md`
- **公開フォームの不統一禁止** → 間隔 `space-y-6`、エラー `<div role="alert">` + border スタイル
- **公開ページで Design System Primitive 迂回禁止** → `ImageFrame`/`Section`/`PageLayout`/`Button` を使用
- **公開ページのセクション背景色交互配置禁止** → 全セクション `bg-background` 統一 → `project-design-config.md`

### プロセス

- **検証なしの完了報告禁止** → 作業中 `bun run type-check`、完了前 `bun run validate`、コミット前 `bun run validate && bun run build`
- **一括修正後の残存チェック省略禁止** → grep/Grep で違反パターンの残存ゼロを確認してから完了報告
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認

---

## ワークフロー

> **セッション継続時**: `docs/plans/README.md` を確認

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

- **計画作成**: `brainstorming` → `writing-plans`（`docs/plans/YYYY-MM-DD-*.md`）
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`

## ルールとレビュー

`.claude/rules/`（29ファイル）が `paths:` フロントマターで条件付き自動ロード。最重要は `gotchas.md`。
レビューエージェントの指摘は `gotchas.md` と照合して検証する（`revalidateTag` 第2引数や Turbopack チャンク重複は誤報されやすい）。
