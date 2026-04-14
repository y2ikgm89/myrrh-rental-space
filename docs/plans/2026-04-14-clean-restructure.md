# Clean Restructure Implementation Plan

**ステータス**: Workstreams 1–4 完了 / Workstream 5 (Lexical UI) 別ブランチへ切り出し予定

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 500行超ドメインコマンドファイル3件と Lexical UI プラグイン3件をサブドメイン分割し、型安全例外を文書化することで、後方互換性を捨てたクリーンな構造に再編する。

## 進捗サマリ (2026-04-14)

- ✅ **Workstream 1**: `type-safety.md` 例外追記（`ef53432e`, `d02c86bd`）
- ✅ **Workstream 2**: reservations/commands.ts 分割 → `payloads` / `status` / `admin-commands` / `public-commands` / `lifecycle-commands`（`69f1549c` 〜 `d86375da`、6 コミット）
- ✅ **Workstream 3**: faq/commands.ts 分割 → `category-commands` / `item-commands` / `item-bulk-commands` / `analytics-commands`（`a4ac6efd` 〜 `7e850c6b`、4 コミット）
- ✅ **Workstream 4**: posts/commands.ts 分割 → `post-commands` / `version-commands` / `category-commands` / `tag-commands` / `bulk-commands`（`60e55284` 〜 `a3efcc78`、5 コミット）
  - 付随改善: `updatePostCategoryOrder` を禁止の `$transaction([...])` 配列形式から公式推奨の interactive transaction へ修正
  - 付随改善: 呼び出し側の `import { X as Y }` エイリアスを `import * as domainCommands` namespace インポートに統一
- 🔜 **Workstream 5**: Lexical UI 分割 — 本プランから切り離し、別ブランチ `feature/lexical-ui-split` で実施予定（`ToolbarPlugin.tsx` 960行 / `FloatingToolbarPlugin.tsx` 877行 / `insert-items.ts` 879行 — 各抽出ごとに dev サーバー + ブラウザでのランタイム検証が必須のため、domain 層の純粋リファクタリングとはレビュー粒度が異なる）

**検証結果 (Workstreams 2–4)**:

- `bun run type-check` → 0 errors
- `bun test __tests__/integration/actions/admin/faq.test.ts` → 43/43 pass
- `bun test __tests__/integration/actions/admin/post.test.ts` → 58/58 pass
- `bun test __tests__/unit/lib/validations/post.test.ts` → 46/46 pass
- 旧 `commands.ts` はすべて完全削除（`grep -rn 'from "@/shared/domain/(faq|posts|reservations)/commands"' src __tests__` → 0 matches）

**Architecture:** 既存の公開 API（Server Actions）は壊さず、内部実装ファイルのみを分割する。各ワークストリームは独立しており、並列実行・ロールバック可能。Barrel re-export は禁止（Turbopack 互換性 / `.claude/rules/gotchas.md`）のため、呼び出し元は全て直接 import に切り替える。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 6 / Prisma 7 / Lexical 0.43

**Workstreams:**

1. `type-safety.md` 例外追記（15分、独立）
2. `reservations/commands.ts` 分割（928行 → admin / public / status / payment / lifecycle）
3. `faq/commands.ts` 分割（602行 → categories / items / items-bulk / analytics）
4. `posts/commands.ts` 分割（594行 → posts / versions / categories / tags / bulk）
5. Lexical UI 分割（`ToolbarPlugin` / `FloatingToolbarPlugin` / `insert-items`）

各ワークストリームは独立コミット。各タスクは 2-5 分単位。

---

## Workstream 1: type-safety.md 例外追記

### Task 1.1: `standardSchemaResolver` 境界変換例外を許可例外リストに追加

**Files:**

- Modify: `.claude/rules/type-safety.md`

- [ ] **Step 1: 該当箇所を読む**

`.claude/rules/type-safety.md` の §型アサーション §許可例外セクションで、6 番 (`withMeta`) の直後に 7 番を追加する場所を特定する。

- [ ] **Step 2: 例外 7 を追記**

`withMeta` セクションの直後に以下を追加：

```markdown
**7. `standardSchemaResolver` 境界変換（`auto-section-form.tsx` の RHF 呼び出しのみ）**

RHF の `standardSchemaResolver` は `StandardSchemaV1<FieldValues>` を要求するが、動的セクション定義の `configSchema` は `z.ZodType<unknown>` として保持される（`sectionConfigSchemas` マップから取得）。`configSchema` は全て `z.object({...})` で定義されるため実行時は安全だが、TypeScript の invariance のため `as unknown as z.ZodObject<Record<string, z.ZodType>>` で橋渡しする。同パターンは `react-patterns.md` §React Hook Form — `Control<T>` 不変性 で説明される「Pure Component + Connected wrapper」の例外として許容される（単一フォームのため wrapper 分離は過剰）。

\`\`\`typescript
// src/app/(admin)/admin/(dashboard)/pages/[slug]/\_sections/\_components/auto-section-form.tsx
resolver: standardSchemaResolver(
schema as unknown as z.ZodObject<Record<string, z.ZodType>>,
),
\`\`\`
```

- [ ] **Step 3: auto-section-form.tsx のコメントを更新**

`src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx:90-104` のコメントブロックを以下に置換：

```typescript
// standardSchemaResolver は StandardSchemaV1<FieldValues> を要求するが、
// z.ZodType<unknown> は input 型が unknown のため直接互換しない。
// configSchema は常に z.object({...}) で定義されるため FieldValues と互換。
// type-safety.md §許可例外 7 で文書化された境界変換パターン。
```

- [ ] **Step 4: 検証**

Run: `bun run type-check`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/type-safety.md src/app/\(admin\)/admin/\(dashboard\)/pages/\[slug\]/_sections/_components/auto-section-form.tsx
git commit -m "docs(rules): document standardSchemaResolver boundary cast as type-safety exception"
```

---

## Workstream 2: reservations/commands.ts 分割

**現状**: `src/shared/domain/reservations/commands.ts` (928行, 8 exported functions + payload builder)

**分割方針**:

- `payloads.ts` — `ReservationPayload`, `buildPayload`, `PAYLOAD_SELECT`, `CUSTOMER_SELECT`（共通定数・ビルダー）
- `status.ts` — `validateStatusTransition`
- `admin-commands.ts` — `createAdminReservationCommand`, `updateAdminReservationCommand`
- `public-commands.ts` — `createPublicReservationCommand`
- `lifecycle-commands.ts` — `updateReservationStatusCommand`, `updateReservationNotesCommand`, `deleteReservationCommand`, `restoreReservationCommand`
- 旧 `commands.ts` は削除

呼び出し元は 17 箇所。各ワークストリーム完了後に一括更新。

### Task 2.1: 現状テストのベースライン確認

**Files:**

- Run: `__tests__/integration/actions/admin/reservation.test.ts`
- Run: `__tests__/integration/actions/public/reservation.test.ts`
- Run: `__tests__/integration/actions/public/mypage-reservation.test.ts`

- [ ] **Step 1: 関連テストを実行してベースライン確立**

```bash
bun test __tests__/integration/actions/admin/reservation.test.ts
bun test __tests__/integration/actions/public/reservation.test.ts
bun test __tests__/integration/actions/public/mypage-reservation.test.ts
```

Expected: 全 PASS

- [ ] **Step 2: 呼び出し元の全リストを取得**

```bash
grep -rn "from \"@/shared/domain/reservations/commands\"" src __tests__ > /tmp/reservations-importers.txt
wc -l /tmp/reservations-importers.txt
```

Expected: 件数を記録（基準値）

### Task 2.2: `payloads.ts` 作成

**Files:**

- Create: `src/shared/domain/reservations/payloads.ts`
- Modify: `src/shared/domain/reservations/commands.ts`

- [ ] **Step 1: `commands.ts:1-250` の import 群・型定義・`PAYLOAD_SELECT` / `CUSTOMER_SELECT` 定数・`buildPayload` / `ReservationPayload` 型を切り出し**

`src/shared/domain/reservations/payloads.ts` を新規作成し、以下を移動：

- `import` 群（payload 構築に必要なもの）
- `type ReservationPayload`
- `const PAYLOAD_SELECT`
- `const CUSTOMER_SELECT`
- `function buildPayload(reservation)`
- その他ヘルパー（`resolveCustomerPayload` 等、`commands.ts:40-250` の範囲にあるもの）

全て `export` する。

- [ ] **Step 2: `commands.ts` から切り出し済みコードを削除し、`payloads.ts` から import**

```typescript
// commands.ts 先頭
import {
  type ReservationPayload,
  PAYLOAD_SELECT,
  CUSTOMER_SELECT,
  buildPayload,
} from "./payloads";
```

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/domain/reservations/payloads.ts src/shared/domain/reservations/commands.ts
git commit -m "refactor(reservations): extract ReservationPayload and builders to payloads.ts"
```

### Task 2.3: `status.ts` 作成

**Files:**

- Create: `src/shared/domain/reservations/status.ts`
- Modify: `src/shared/domain/reservations/commands.ts`

- [ ] **Step 1: `validateStatusTransition` を `status.ts` に移動**

`commands.ts:251-279` の `validateStatusTransition` 関数を `src/shared/domain/reservations/status.ts` に移動、`export` する。`RESERVATION_STATUS_TRANSITIONS` 依存の import も移動する。

- [ ] **Step 2: `commands.ts` から import に置換**

```typescript
import { validateStatusTransition } from "./status";
```

- [ ] **Step 3: 呼び出し元（`src/**`+`**tests**/**`）を grep し `validateStatusTransition`を直接 import している箇所を`./status` 経由に修正**

```bash
grep -rln "import { validateStatusTransition } from \"@/shared/domain/reservations/commands\"" src __tests__
```

各箇所を `@/shared/domain/reservations/status` に変更。

- [ ] **Step 4: 型チェック + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/reservation.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/reservations/status.ts src/shared/domain/reservations/commands.ts src __tests__
git commit -m "refactor(reservations): extract validateStatusTransition to status.ts"
```

### Task 2.4: `admin-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/reservations/admin-commands.ts`
- Modify: `src/shared/domain/reservations/commands.ts`

- [ ] **Step 1: `createAdminReservationCommand` (行 281-417) と `updateAdminReservationCommand` (行 419-550) を移動**

`src/shared/domain/reservations/admin-commands.ts` 新規作成、上記 2 関数を移動。import は `./payloads` / `./status` 経由に調整。`@/shared/db/prisma`, `@/shared/lib/errors` 等の外部 import は新ファイルに追加。

- [ ] **Step 2: `commands.ts` から該当コードを削除**

- [ ] **Step 3: 呼び出し元を一括更新**

```bash
grep -rln "createAdminReservationCommand\|updateAdminReservationCommand" src __tests__ | \
  xargs grep -l "from \"@/shared/domain/reservations/commands\""
```

各ファイルで該当 import を `@/shared/domain/reservations/admin-commands` に変更。

- [ ] **Step 4: 型チェック + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/reservation.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reservations): extract admin commands to admin-commands.ts"
```

### Task 2.5: `public-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/reservations/public-commands.ts`
- Modify: `src/shared/domain/reservations/commands.ts`

- [ ] **Step 1: `createPublicReservationCommand` (行 753-928) を `public-commands.ts` に移動**

- [ ] **Step 2: `commands.ts` から削除**

- [ ] **Step 3: 呼び出し元を `@/shared/domain/reservations/public-commands` に切り替え**

```bash
grep -rln "createPublicReservationCommand" src __tests__
```

- [ ] **Step 4: 型チェック + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/public/reservation.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reservations): extract public command to public-commands.ts"
```

### Task 2.6: `lifecycle-commands.ts` 作成と旧ファイル削除

**Files:**

- Create: `src/shared/domain/reservations/lifecycle-commands.ts`
- Delete: `src/shared/domain/reservations/commands.ts`

- [ ] **Step 1: 残存する 4 関数 (`updateReservationStatusCommand`, `updateReservationNotesCommand`, `deleteReservationCommand`, `restoreReservationCommand`) を `lifecycle-commands.ts` に移動**

- [ ] **Step 2: `commands.ts` を削除**

```bash
git rm src/shared/domain/reservations/commands.ts
```

- [ ] **Step 3: 呼び出し元を `@/shared/domain/reservations/lifecycle-commands` に切り替え**

```bash
grep -rln "updateReservationStatusCommand\|updateReservationNotesCommand\|deleteReservationCommand\|restoreReservationCommand" src __tests__
```

- [ ] **Step 4: 残存 import 検証**

```bash
grep -rn "from \"@/shared/domain/reservations/commands\"" src __tests__
```

Expected: 0 matches

- [ ] **Step 5: 型チェック + 全 reservations テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/reservation.test.ts
bun test __tests__/integration/actions/public/reservation.test.ts
bun test __tests__/integration/actions/public/mypage-reservation.test.ts
```

Expected: 全 PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(reservations): extract lifecycle commands and remove monolithic commands.ts"
```

---

## Workstream 3: faq/commands.ts 分割

**現状**: `src/shared/domain/faq/commands.ts` (602行, 20 exported functions)

**分割方針**:

- `category-commands.ts` — `createFaqCategory`, `updateFaqCategory`, `deleteFaqCategory`, `restoreFaqCategory`, `permanentlyDeleteFaqCategory`, `reorderFaqCategories` (6関数)
- `item-commands.ts` — `createFaqItem`, `updateFaqItem`, `deleteFaqItem`, `restoreFaqItem`, `permanentlyDeleteFaqItem`, `reorderFaqItems`, `toggleFaqItemPublished` (7関数)
- `item-bulk-commands.ts` — `bulkPublishFaqItems`, `bulkDeleteFaqItems`, `bulkMoveFaqItems` (3関数)
- `analytics-commands.ts` — `incrementFaqItemViewCount`, `detectStaleFaqItems`, `voteFaqItemHelpful`, `permanentlyDeleteExpiredFaqTrash` (4関数)
- 旧 `commands.ts` は削除

### Task 3.1: ベースラインテスト確認

- [ ] **Step 1: FAQ 関連テストを実行**

```bash
bun test __tests__/integration/actions/admin/faq.test.ts
```

Expected: 全 PASS

- [ ] **Step 2: 呼び出し元リスト取得**

```bash
grep -rn "from \"@/shared/domain/faq/commands\"" src __tests__ > /tmp/faq-importers.txt
wc -l /tmp/faq-importers.txt
```

### Task 3.2: `category-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/faq/category-commands.ts`
- Modify: `src/shared/domain/faq/commands.ts`

- [ ] **Step 1: `commands.ts:76-234` のカテゴリ系 6 関数を `category-commands.ts` に移動**

共通 import（`prisma`, `CACHE_TAGS`, `updateTag`, `logError` 等）と共通型ヘルパーを新ファイルに追加。

- [ ] **Step 2: `commands.ts` から削除**

- [ ] **Step 3: 呼び出し元を `@/shared/domain/faq/category-commands` に切り替え**

- [ ] **Step 4: 型チェック + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/faq.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(faq): extract category commands to category-commands.ts"
```

### Task 3.3: `item-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/faq/item-commands.ts`
- Modify: `src/shared/domain/faq/commands.ts`

- [ ] **Step 1: 項目系 7 関数 (`createFaqItem` 他) を移動**

- [ ] **Step 2: `commands.ts` から削除**

- [ ] **Step 3: 呼び出し元を切り替え**

- [ ] **Step 4: 型チェック + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/faq.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(faq): extract item commands to item-commands.ts"
```

### Task 3.4: `item-bulk-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/faq/item-bulk-commands.ts`
- Modify: `src/shared/domain/faq/commands.ts`

- [ ] **Step 1: bulk 系 3 関数を移動**

`bulkPublishFaqItems`, `bulkDeleteFaqItems`, `bulkMoveFaqItems`。`bulkMoveFaqItems` の interactive `$transaction` パターンに注意（`gotchas.md` §トランザクション）。

- [ ] **Step 2: 呼び出し元切り替え + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/faq.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(faq): extract bulk item commands to item-bulk-commands.ts"
```

### Task 3.5: `analytics-commands.ts` 作成と旧ファイル削除

**Files:**

- Create: `src/shared/domain/faq/analytics-commands.ts`
- Delete: `src/shared/domain/faq/commands.ts`

- [ ] **Step 1: 残りの 4 関数を `analytics-commands.ts` に移動**

`incrementFaqItemViewCount`, `detectStaleFaqItems`, `voteFaqItemHelpful`, `permanentlyDeleteExpiredFaqTrash`

- [ ] **Step 2: `commands.ts` 削除**

```bash
git rm src/shared/domain/faq/commands.ts
```

- [ ] **Step 3: 残存 import 確認**

```bash
grep -rn "from \"@/shared/domain/faq/commands\"" src __tests__
```

Expected: 0 matches

- [ ] **Step 4: 型チェック + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/faq.test.ts
bun test __tests__/unit/lib/validations/faq.test.ts
```

Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(faq): extract analytics commands and remove monolithic commands.ts"
```

---

## Workstream 4: posts/commands.ts 分割

**現状**: `src/shared/domain/posts/commands.ts` (594行, 18 exported functions)

**分割方針**:

- `post-commands.ts` — `createPost`, `updatePostBody`, `updatePostSettings`, `deletePost`, `publishPost`, `unpublishPost` (6関数)
- `version-commands.ts` — `createPostBackup`, `restorePostVersion` (2関数)
- `category-commands.ts` — `createPostCategory`, `updatePostCategory`, `deletePostCategory`, `updatePostCategoryOrder` (4関数)
- `tag-commands.ts` — `createPostTag`, `updatePostTag`, `deletePostTag` (3関数)
- `bulk-commands.ts` — `bulkTogglePublishedCommand`, `bulkDeletePostsCommand` (2関数)
- 旧 `commands.ts` は削除

### Task 4.1: ベースラインテスト確認

- [ ] **Step 1: Posts 関連テストを実行**

```bash
bun test __tests__/integration/actions/admin/post.test.ts
bun test __tests__/integration/actions/post.test.ts
bun test __tests__/unit/domain/posts-routing.test.ts
```

Expected: 全 PASS

### Task 4.2: `post-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/posts/post-commands.ts`
- Modify: `src/shared/domain/posts/commands.ts`

- [ ] **Step 1: `commands.ts:1-149` の共通 import・型・ヘルパー（`DeletePostResult` 等）を `post-commands.ts` にコピー**

- [ ] **Step 2: 行 150-339 の 6 関数 (`createPost` 〜 `unpublishPost`) を `post-commands.ts` に移動**

- [ ] **Step 3: `commands.ts` から削除**

- [ ] **Step 4: 呼び出し元切り替え**

```bash
grep -rln "createPost\|updatePostBody\|updatePostSettings\|deletePost\|publishPost\|unpublishPost" src __tests__ | \
  xargs grep -l "from \"@/shared/domain/posts/commands\""
```

各ファイルで `@/shared/domain/posts/post-commands` に変更。

- [ ] **Step 5: 型チェック + テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/post.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(posts): extract post lifecycle commands to post-commands.ts"
```

### Task 4.3: `version-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/posts/version-commands.ts`
- Modify: `src/shared/domain/posts/commands.ts`

- [ ] **Step 1: `createPostBackup`, `restorePostVersion` を移動**

- [ ] **Step 2: 呼び出し元切り替え + テスト + Commit**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/post.test.ts
git add -A
git commit -m "refactor(posts): extract version commands to version-commands.ts"
```

### Task 4.4: `category-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/posts/category-commands.ts`
- Modify: `src/shared/domain/posts/commands.ts`

- [ ] **Step 1: カテゴリ系 4 関数を移動**

- [ ] **Step 2: 呼び出し元切り替え + テスト + Commit**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/post.test.ts
git add -A
git commit -m "refactor(posts): extract category commands to category-commands.ts"
```

### Task 4.5: `tag-commands.ts` 作成

**Files:**

- Create: `src/shared/domain/posts/tag-commands.ts`
- Modify: `src/shared/domain/posts/commands.ts`

- [ ] **Step 1: タグ系 3 関数を移動**

- [ ] **Step 2: 呼び出し元切り替え + テスト + Commit**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/post.test.ts
git add -A
git commit -m "refactor(posts): extract tag commands to tag-commands.ts"
```

### Task 4.6: `bulk-commands.ts` 作成と旧ファイル削除

**Files:**

- Create: `src/shared/domain/posts/bulk-commands.ts`
- Delete: `src/shared/domain/posts/commands.ts`

- [ ] **Step 1: `bulkTogglePublishedCommand`, `bulkDeletePostsCommand` を移動**

- [ ] **Step 2: `commands.ts` 削除**

```bash
git rm src/shared/domain/posts/commands.ts
```

- [ ] **Step 3: 残存 import 確認**

```bash
grep -rn "from \"@/shared/domain/posts/commands\"" src __tests__
```

Expected: 0 matches

- [ ] **Step 4: 型チェック + 全 posts テスト**

```bash
bun run type-check
bun test __tests__/integration/actions/admin/post.test.ts
bun test __tests__/integration/actions/post.test.ts
bun test __tests__/unit/lib/validations/post.test.ts
```

Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(posts): extract bulk commands and remove monolithic commands.ts"
```

---

## Workstream 5: Lexical UI 分割

**現状** (確認済み):

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx` (960行)
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FloatingToolbarPlugin.tsx` (877行)
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts` (879行)

**分割方針**:

- `ToolbarPlugin.tsx` → `ToolbarPlugin.tsx`（Orchestrator） + `toolbar/*.tsx`（機能別セクション: format / heading / alignment / insert / history）
- `FloatingToolbarPlugin.tsx` → `FloatingToolbarPlugin.tsx`（Orchestrator） + `floating-toolbar/*.tsx`
- `insert-items.ts` → `config/insert-items/` ディレクトリに分割（media / embed / layout / structure）

**注意**: Lexical プラグインは React Compiler 1.0 との互換性を維持する必要がある（`.claude/rules/react-patterns.md`）。分割前後で `useGSAP` / `useSyncExternalStore` / `'use no memo'` の配置を変えない。

### Task 5.1: ToolbarPlugin 構造調査

**Files:**

- Read: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx`

- [ ] **Step 1: export と関数境界を把握**

```bash
grep -n "^function \|^const \|^export " "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx"
```

結果をもとに機能ブロック（format / heading / alignment / insert / history / link / list）を特定する。各ブロックの開始・終了行を記録。

- [ ] **Step 2: ビジュアル確認のため dev サーバー起動**

```bash
bun dev
```

ブラウザで `/admin/posts/[任意 ID]/edit` を開き、ToolbarPlugin が正常動作することを確認。dev サーバーは継続使用する（Task 5.4 まで）。

### Task 5.2: ToolbarPlugin セクション分割

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/toolbar/FormatSection.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/toolbar/HeadingSection.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/toolbar/AlignmentSection.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/toolbar/InsertSection.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/toolbar/HistorySection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx`

- [ ] **Step 1: FormatSection 抽出（Bold / Italic / Underline / Strikethrough / Code ボタン群）**

Task 5.1 で特定した範囲を `FormatSection.tsx` に切り出し。Lexical editor instance は props 経由で受け取る：

```typescript
import type { LexicalEditor } from "lexical";
import type { RangeSelection } from "lexical";

type FormatSectionProps = {
  editor: LexicalEditor;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  isCode: boolean;
};

export function FormatSection(props: FormatSectionProps) {
  // 既存の format ボタン群を移動
}
```

`ToolbarPlugin.tsx` で `<FormatSection editor={editor} isBold={isBold} ... />` と呼ぶ。

- [ ] **Step 2: 型チェック + ブラウザ確認**

```bash
bun run type-check
```

Expected: 0 errors。ブラウザで Bold / Italic トグルが機能することを手動確認。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(lexical): extract FormatSection from ToolbarPlugin"
```

- [ ] **Step 4: HeadingSection 抽出（H1-H6 + Paragraph Select）**

同様のパターンで分割。`blockType` state を props で渡す。

- [ ] **Step 5: 型チェック + ブラウザ確認 + Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract HeadingSection from ToolbarPlugin"
```

- [ ] **Step 6: AlignmentSection 抽出（Left / Center / Right / Justify）**

- [ ] **Step 7: 型チェック + ブラウザ確認 + Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract AlignmentSection from ToolbarPlugin"
```

- [ ] **Step 8: InsertSection 抽出（Link / Image / Table / HorizontalRule 等の挿入 UI）**

- [ ] **Step 9: 型チェック + ブラウザ確認 + Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract InsertSection from ToolbarPlugin"
```

- [ ] **Step 10: HistorySection 抽出（Undo / Redo）**

- [ ] **Step 11: 型チェック + ブラウザ確認 + Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract HistorySection from ToolbarPlugin"
```

- [ ] **Step 12: 最終確認 — `ToolbarPlugin.tsx` が 300 行以下になったことを確認**

```bash
wc -l "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx"
```

Expected: < 300 行（Orchestrator として state 管理と section composition のみ）

### Task 5.3: FloatingToolbarPlugin 分割

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/floating-toolbar/QuickFormatSection.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/floating-toolbar/LinkSection.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/floating-toolbar/ColorSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FloatingToolbarPlugin.tsx`

- [ ] **Step 1: 構造調査**

```bash
grep -n "^function \|^const \|^export " "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FloatingToolbarPlugin.tsx"
```

機能ブロック（quick format / link / color / highlight）を特定。

- [ ] **Step 2: QuickFormatSection 抽出 → 型チェック → ブラウザ確認 → Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract QuickFormatSection from FloatingToolbarPlugin"
```

テキスト選択 → フローティングツールバーが表示される → Bold / Italic トグルが機能するまでを手動確認。

- [ ] **Step 3: LinkSection 抽出 → 型チェック → ブラウザ確認 → Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract LinkSection from FloatingToolbarPlugin"
```

リンク挿入ダイアログの動作を手動確認。

- [ ] **Step 4: ColorSection 抽出 → 型チェック → ブラウザ確認 → Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract ColorSection from FloatingToolbarPlugin"
```

カラーピッカーの動作を手動確認。

- [ ] **Step 5: 最終確認**

```bash
wc -l "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FloatingToolbarPlugin.tsx"
```

Expected: < 300 行

### Task 5.4: insert-items.ts 分割

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/media.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/embed.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/layout.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/structure.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/index.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts`

> **例外**: `.claude/rules/project-structure.md` の「barrel export 禁止」は `.claude/rules/gotchas.md` §Lexical で「Lexical 内部の `plugins/index.ts`, `nodes/index.ts` は例外」と明記されている。`insert-items/index.ts` も Lexical 内部のため例外扱いで許容。

- [ ] **Step 1: 構造調査**

```bash
grep -n "^export " "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts"
```

export されている定数・関数を把握し、4 カテゴリ（media / embed / layout / structure）に分類。

- [ ] **Step 2: media.ts 作成（Image / Video / Audio / Gallery 関連）**

- [ ] **Step 3: 呼び出し元を `./insert-items/media` に切り替え**

```bash
grep -rln "from \"@/admin/.../lexical/config/insert-items\"" src
```

各箇所で該当 import を細かいパスに切り替え。

- [ ] **Step 4: 型チェック + ブラウザ確認**

```bash
bun run type-check
```

エディタで画像挿入メニューが機能することを手動確認。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(lexical): extract media insert items"
```

- [ ] **Step 6: embed.ts 作成（YouTube / Twitter / iFrame / Instagram）→ 切り替え → 確認 → Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract embed insert items"
```

- [ ] **Step 7: layout.ts 作成（Columns / Container / Spacer / Divider）→ 切り替え → 確認 → Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract layout insert items"
```

- [ ] **Step 8: structure.ts 作成（Table / Accordion / Tabs / Quote / Code Block）→ 切り替え → 確認 → Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): extract structure insert items"
```

- [ ] **Step 9: index.ts を作成し全 sub-module を re-export**

`insert-items/index.ts`:

```typescript
export * from "./media";
export * from "./embed";
export * from "./layout";
export * from "./structure";
```

- [ ] **Step 10: 旧 `insert-items.ts` を削除**

```bash
git rm "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts"
```

- [ ] **Step 11: 残存 import 確認**

```bash
grep -rn "from.*config/insert-items\"" src
```

Expected: 全て `config/insert-items/{media,embed,layout,structure}` または `config/insert-items`（barrel）に解決

- [ ] **Step 12: 型チェック + 全エディタ機能ブラウザ確認 + Commit**

```bash
bun run type-check
git add -A
git commit -m "refactor(lexical): remove monolithic insert-items.ts"
```

---

## Final Verification

### Task 6.1: 全体検証

- [ ] **Step 1: 完全検証コマンド実行**

```bash
bun run validate && bun run build
```

Expected: 全て PASS

- [ ] **Step 2: ドメインテスト一括実行**

```bash
bun test __tests__/integration/actions/admin/reservation.test.ts
bun test __tests__/integration/actions/admin/faq.test.ts
bun test __tests__/integration/actions/admin/post.test.ts
bun test __tests__/integration/actions/public/reservation.test.ts
bun test __tests__/integration/actions/public/mypage-reservation.test.ts
bun test __tests__/integration/actions/post.test.ts
bun test __tests__/unit/domain/posts-routing.test.ts
bun test __tests__/unit/lib/validations/faq.test.ts
bun test __tests__/unit/lib/validations/post.test.ts
bun test __tests__/unit/lib/validations/admin-reservation.test.ts
```

Expected: 全 PASS

- [ ] **Step 3: 行数削減確認**

```bash
find src/shared/domain/reservations -name "*.ts" -not -name "*.test.ts" | xargs wc -l
find src/shared/domain/faq -name "*.ts" -not -name "*.test.ts" | xargs wc -l
find src/shared/domain/posts -name "*.ts" -not -name "*.test.ts" | xargs wc -l
wc -l "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx"
wc -l "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FloatingToolbarPlugin.tsx"
```

Expected: 旧 `commands.ts` が全て削除されている。全分割ファイルが 500 行未満。`ToolbarPlugin.tsx` / `FloatingToolbarPlugin.tsx` が 300 行未満。

- [ ] **Step 4: 手動ブラウザ検証 (golden path)**

dev サーバーで以下を手動確認：

1. `/admin/reservations/new` → 予約作成フォーム送信
2. `/admin/reservations/[id]/edit` → ステータス変更
3. `/admin/posts/[id]/edit` → Lexical ToolbarPlugin / FloatingToolbarPlugin / Insert menu すべて機能
4. `/admin/faq/items/[id]/edit` → FAQ 項目更新
5. `/reservation` → 公開予約フォーム送信

全て通ることを確認。

---

## Risk Notes

- **Server Action の barrel export 禁止** (`gotchas.md` §Claude Code 設定 / ビルド・検証): `"use server"` ファイルを barrel 経由で import するとクライアントバンドルから解決不可。本プランは元から `commands.ts` 単一ファイルを直接 import しているため、分割後も直接 import パターンを維持する（barrel は作らない）。ただし Workstream 5 の Lexical `insert-items/index.ts` は Server Action ではなく `"use server"` 無しの config データのため barrel 作成 OK。

- **型依存の密結合** (`gotchas.md` §Subagent 規律): Workstream 内のタスク間（例: Task 2.2 → Task 2.3）は型依存がある可能性がある。subagent-driven-development で実行する場合、同一ワークストリーム内は bundle して 1 implementer に渡すか、失敗時に戻せるよう細かく commit する。

- **Turbopack HMR** (`gotchas.md` §フレームワーク固有): Lexical プラグイン編集後は HMR が古い状態を保持することがある。各タスクの手動ブラウザ確認でおかしな挙動が出たら dev サーバー再起動（`cmd //c "taskkill /PID <pid> /F /T"` → `bun dev`）。

- **Validation 頻度**: 大規模リファクタのため各 commit 前に必ず `bun run type-check`。全体の `bun run validate && bun run build` は最後（Task 6.1）で 1 回でよい。

---

## Execution Notes

- **総タスク数**: 約 30 タスク（30-40 コミット）
- **推定所要時間**: 6-10 時間（subagent-driven で並列化すれば 3-5 時間）
- **ワークストリーム間の並列性**: 1, 2, 3, 4, 5 は完全に独立。同時進行可能。
- **完了基準**: Final Verification Task 6.1 の全ステップが PASS
