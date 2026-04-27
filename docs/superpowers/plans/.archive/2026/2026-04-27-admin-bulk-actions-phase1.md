> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# P19 Phase 1 — Admin Bulk Actions 実装計画

> **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase1-design.md`
> **対象**: spaces / events / news の 3 領域に bulk publish/unpublish/delete を導入
> **Bundle 構成**: 3 Bundle (A/B/C) = 3 commit、各 Bundle 並列 dispatch 可能

## Context

`/admin` 一覧ページの一括操作を `posts` / `pages` / `reservations` / `faq` に続いて spaces / events / news に対称化する。既存 `PostBulkActions` パターン（`PostBulkActions.tsx` 141 行 + `bulk-commands.ts` + `actions/post/bulk.ts`）を参照実装として複製する純粋な対称化作業。

各 Bundle は独立リソースの実装で**ファイル衝突なし**のため並列 dispatch 可能。controller は dispatch 後の git verify のみ実施。

---

## Bundle A — Spaces Bulk

**Commit message**: `feat(admin): bulk publish/delete actions for spaces`

### Files to create

1. `src/shared/domain/spaces/bulk-commands.ts` (new)
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/space/bulk.ts` (new)
3. `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceBulkActions.tsx` (new)
4. `__tests__/unit/domain/spaces/bulk-commands.test.ts` (new)
5. `__tests__/integration/actions/admin/space-bulk.test.ts` (new)

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx` — 行 checkbox + `selectedIds` state + `<SpaceBulkActions />` 配置
2. `src/app/(admin)/admin/(dashboard)/spaces/_components/space-table-desktop.tsx` — 同上の desktop 版調整（必要に応じて）
3. `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` — `bulk.ts` の re-export 追加（barrel パターン採用済みの場合）
4. `package.json` — `test:unit` に `bun test __tests__/unit/domain/spaces/bulk-commands.test.ts` バッチ追加

### Tasks

#### A1. domain command (`bulk-commands.ts`)

参照実装: `src/shared/domain/posts/bulk-commands.ts`

```typescript
import "server-only";

import { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";

export type BulkPublishResult = {
  count: number;
  isPublished: boolean;
  affectedSlugs: string[];
};

export type BulkDeleteResult = {
  count: number;
  skipped: number;
  affectedSlugs: string[];
};

export async function bulkTogglePublishedSpacesCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishResult> {
  if (ids.length === 0)
    return { count: 0, isPublished: publish, affectedSlugs: [] };
  const now = new Date();
  // updateMany では updated 行の slug を取得できないため、先に slug 取得 → updateMany
  const targets = await prisma.space.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const result = await prisma.space.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isPublished: publish, publishedAt: publish ? now : null },
  });
  return {
    count: result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
  };
}

export async function bulkDeleteSpacesCommand(
  ids: string[],
): Promise<BulkDeleteResult> {
  if (ids.length === 0) return { count: 0, skipped: 0, affectedSlugs: [] };
  const targets = await prisma.space.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  let count = 0;
  let skipped = 0;
  const affectedSlugs: string[] = [];
  // FK 制約 (Reservation.spaceId) で個別 P2003 を catch するため逐次削除
  for (const target of targets) {
    try {
      await prisma.space.delete({ where: { id: target.id } });
      count += 1;
      affectedSlugs.push(target.slug);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { count, skipped, affectedSlugs };
}
```

**規律**:

- `import "server-only"` 必須
- `Prisma` 名前空間は `@/shared/lib/validations/enums/prisma-types` gateway 経由（`PrismaClientKnownRequestError` は **runtime sentinel** ではないため gateway OK）。実際には型のみ参照のため `import type { Prisma }` で問題なし
- ただし `Prisma.PrismaClientKnownRequestError` は **値判定**（`instanceof`）に使うため runtime import が必要。実装者は `import { Prisma } from "@generated/prisma/client"` で直接 import すること（domain layer は gateway 経由禁止対象外、gateway 経由で `instanceof` できるか要 verify）

#### A2. Server Action (`actions/space/bulk.ts`)

参照実装: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts`

```typescript
"use server";

import { z } from "zod";
import {
  bulkTogglePublishedSpacesCommand,
  bulkDeleteSpacesCommand,
  type BulkPublishResult,
  type BulkDeleteResult,
} from "@/shared/domain/spaces/bulk-commands";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateSpaceCaches } from "@/shared/lib/cache/space-cache"; // 既存 helper
import { createValidationError } from "@/admin/types/server-actions";
import type { MutationResult } from "@/shared/lib/mutation-result";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "ID が不正です" }))
    .min(1, { error: "1 件以上選択してください" })
    .max(100, { error: "一度に処理できるのは 100 件までです" }),
});

export const bulkTogglePublishedSpaces = async (
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationError(parsed.error);
  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    execute: async () =>
      bulkTogglePublishedSpacesCommand(parsed.data.ids, publish),
    afterSuccess: async (data) => {
      // CACHE_TAGS.SPACES + per-slug detail tag cascade
      for (const slug of data.affectedSlugs) {
        // existing helper or invalidateSpaceCaches(undefined, slug) パターンに合わせる
      }
    },
  });
};

export const bulkDeleteSpaces = async (
  ids: string[],
): Promise<MutationResult<BulkDeleteResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationError(parsed.error);
  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    execute: async () => bulkDeleteSpacesCommand(parsed.data.ids),
    afterSuccess: async (data) => {
      for (const slug of data.affectedSlugs) {
        // cache invalidation
      }
    },
  });
};
```

**実装者注意**:

- `invalidateSpaceCaches` の正確な署名は `src/shared/lib/cache/space-cache.ts` を Read して確認。bulk 版がなければ ids ループで既存版を呼ぶ
- `createValidationError` の import 経路は `@/admin/types/server-actions` を Read して確認
- `executeAdminMutationResult` の `action` 値は `Action` enum (`@/admin/lib/admin-resources` または `permissions.ts`) に存在する値のみ可（`publish` / `delete` は実在確認）

#### A3. UI (`SpaceBulkActions.tsx`)

参照実装: `src/app/(admin)/admin/(dashboard)/posts/_components/PostBulkActions.tsx` を複製。

差分:

- `bulkTogglePostPublished` → `bulkTogglePublishedSpaces`
- `bulkDeletePosts` → `bulkDeleteSpaces`
- toast: `${count}件のスペースを公開しました` / `${count}件公開、${skipped}件はスキップ（FK 制約）`
- 削除 toast: `${count}件削除、${skipped}件はスキップ（紐づく予約あり）`
- 削除前確認: `DeleteConfirmDialog`（`pages/_components/BulkActions.tsx` 参照）を統合推奨

#### A4. Table 改修 (`SpaceTable.tsx` / `space-table-desktop.tsx`)

1. `"use client"` 確認（既に Client）
2. `useState<string[]>([])` で `selectedIds`
3. ヘッダー row に all-select `CheckboxCell`
4. 各 data row 先頭に `<TableCell onClick={stopRowClick}><CheckboxCell aria-label={`${space.name} を選択`} ... /></TableCell>`
5. テーブル外（return の Fragment 末尾）に `<SpaceBulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} />`

`ClickableTableRow` 採用済みの場合、checkbox セルの `onClick={stopRowClick}` で行クリック遷移を遮断する。

#### A5. Tests

**Unit** (`__tests__/unit/domain/spaces/bulk-commands.test.ts`):

- 空配列で count: 0 / DB 呼ばない
- 複数件 publish 成功 / `affectedSlugs` 取得
- FK 制約 (P2003) 1 件で skipped カウント
- 全件 P2003 で count: 0 / skipped: N

**Integration** (`__tests__/integration/actions/admin/space-bulk.test.ts`):

- 未認証 → `MutationError`
- VIEWER role → permission denied
- 100 件超 → validation error
- 正常系で `executeAdminMutationResult` mock が呼ばれる
- mock を `mock.module("@/admin/lib/admin-action", ...)` で差し替え

**package.json**:

```json
"test:unit": "... && bun test __tests__/unit/domain/spaces/bulk-commands.test.ts ...",
"test:integration": "... && bun test __tests__/integration/actions/admin/space-bulk.test.ts ..."
```

（既存バッチへの追記。既存スクリプトの順序を破らないこと）

### Verification (Bundle A)

- `bun run type-check` exit 0
- `bun test __tests__/unit/domain/spaces/bulk-commands.test.ts` exit 0
- `bun test __tests__/integration/actions/admin/space-bulk.test.ts` exit 0
- `git status --short` で modified/new files が想定通り
- `git diff --stat HEAD` で行数妥当（domain ~80 + action ~70 + UI ~150 + table ~30 + tests ~250 ≈ 580 行）

---

## Bundle B — Events Bulk

**Commit message**: `feat(admin): bulk publish/delete actions for events`

### Files to create

1. `src/shared/domain/events/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/events/_components/EventBulkActions.tsx`
4. `__tests__/unit/domain/events/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/event-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/events/_components/EventTable.tsx`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/event/index.ts` (barrel re-export 追加、存在しない場合スキップ)
3. `package.json`

### Tasks

#### B1. domain command (events 固有: status filter + soft delete)

```typescript
import "server-only";

import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";

export type BulkPublishEventsResult = {
  count: number;
  skipped: number;
  isPublished: boolean;
  affectedSlugs: string[];
};

const PUBLISH_FROM_STATUSES = [EventStatus.DRAFT] as const;
const UNPUBLISH_FROM_STATUSES = [EventStatus.PUBLISHED] as const;

export async function bulkPublishEventsCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishEventsResult> {
  if (ids.length === 0)
    return { count: 0, skipped: 0, isPublished: publish, affectedSlugs: [] };
  const allowedStatuses = publish
    ? PUBLISH_FROM_STATUSES
    : UNPUBLISH_FROM_STATUSES;
  const now = new Date();

  const targets = await prisma.event.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: { in: [...allowedStatuses] },
    },
    select: { id: true, slug: true },
  });

  const result = await prisma.event.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      status: publish ? EventStatus.PUBLISHED : EventStatus.DRAFT,
      publishedAt: publish ? now : null,
    },
  });

  return {
    count: result.count,
    skipped: ids.length - result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
  };
}

export async function bulkSoftDeleteEventsCommand(
  ids: string[],
  actor: { id: string },
): Promise<{ count: number; affectedSlugs: string[] }> {
  if (ids.length === 0) return { count: 0, affectedSlugs: [] };
  const targets = await prisma.event.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, slug: true },
  });
  const result = await prisma.event.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { deletedAt: new Date(), deletedById: actor.id },
  });
  return { count: result.count, affectedSlugs: targets.map((t) => t.slug) };
}
```

**規律**:

- `EventStatus` enum は gateway (`prisma-types`) から import 可
- `actor: { id: string }` は `executeAdminMutationResult` の `execute(user)` から渡す（`{ id: user.id, role: user.role }` パターン、CLAUDE.md 「ドメインコマンドの actor 引数は `{ id: string; role: Role }` オブジェクト」）

#### B2. Server Action

参照実装: post/bulk.ts、ただし actor を渡す必要あり:

```typescript
return executeAdminMutationResult({
  resource: "event",
  action: "delete",
  execute: async (user) =>
    bulkSoftDeleteEventsCommand(parsed.data.ids, { id: user.id }),
  afterSuccess: async (data) => {
    for (const slug of data.affectedSlugs) {
      // invalidateEventCaches(id, slug) を呼ぶ
    }
  },
});
```

#### B3. UI (`EventBulkActions.tsx`)

PostBulkActions パターン + skipped カウント表示。toast:

- 公開: `${count}件のイベントを公開しました${skipped > 0 ? `（${skipped}件は状態遷移不可でスキップ）` : ""}`
- 削除: `${count}件のイベントを削除しました`

#### B4. Table 改修 (`EventTable.tsx`)

Bundle A と同パターン。`aria-label` は `${event.title} を選択`。

#### B5. Tests

- 空配列・複数件・status filter（CANCELLED イベントは publish 対象外）・soft delete (`deletedAt` + `deletedById` セット確認)

### Verification (Bundle B)

Bundle A と同等。行数目安 ≈ 600 行。

---

## Bundle C — News Bulk

**Commit message**: `feat(admin): bulk publish/delete actions for news`

### Files to create

1. `src/shared/domain/news/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/news/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/news/_components/NewsBulkActions.tsx`
4. `__tests__/unit/domain/news/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/news-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/news/_components/NewsTable.tsx`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts` (barrel re-export 追加)
3. `package.json`

### Tasks

#### C1. domain command (spaces とほぼ同型、ただし FK 制約なし)

```typescript
export async function bulkTogglePublishedNewsCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; isPublished: boolean; affectedSlugs: string[] }> {
  if (ids.length === 0)
    return { count: 0, isPublished: publish, affectedSlugs: [] };
  const targets = await prisma.news.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const result = await prisma.news.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isPublished: publish, publishedAt: publish ? new Date() : null },
  });
  return {
    count: result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
  };
}

export async function bulkDeleteNewsCommand(
  ids: string[],
): Promise<{ count: number; affectedSlugs: string[] }> {
  if (ids.length === 0) return { count: 0, affectedSlugs: [] };
  const targets = await prisma.news.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const result = await prisma.news.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return { count: result.count, affectedSlugs: targets.map((t) => t.slug) };
}
```

#### C2. Server Action

post/bulk.ts パターン。`invalidateNewsCaches` の存在を確認、なければ `updateTag(CACHE_TAGS.NEWS)` + per-slug `getCacheTag.news.detail(slug)` を直接呼ぶ。

#### C3. UI (`NewsBulkActions.tsx`)

PostBulkActions 複製。toast:「ニュース」表記、skip 概念なしのため最小版で OK。

#### C4. Table 改修 (`NewsTable.tsx`)

Bundle A と同パターン。

#### C5. Tests

Bundle A の spaces 版から FK skip ケースを除いた最小セット。

### Verification (Bundle C)

Bundle A と同等。行数目安 ≈ 500 行（FK 処理ない分軽量）。

---

## 全体検証 (Phase 1 完了時)

1. `bun run validate` exit 0
2. `bun run test:unit` exit 0（新規バッチ含む）
3. `bun run test:integration` exit 0
4. `git log --oneline main..HEAD` で 3 commit 確認
5. 各 commit の `git show --stat HEAD~N` で対象ファイル + 行数妥当性

dev server で手動確認（任意、`feedback_dev-server-manual.md` 準拠でユーザー手動）:

- `/admin/spaces` で複数選択 → 一括公開 → 公開ステータス Badge 反映
- `/admin/events` で複数選択 → 一括削除 → ソフト削除（一覧から消える、ゴミ箱に表示される場合は確認）
- `/admin/news` で複数選択 → 一括非公開 → 公開ステータス反映

---

## Subagent Dispatch 規律

### 並列 dispatch（推奨）

Bundle A / B / C はファイル衝突なしのため **3 並列 dispatch** で context isolation + 高速完了:

```
controller → 3 並列 Agent (general-purpose, sonnet)
  - Bundle A prompt: 上記「Bundle A」節を full text で渡す
  - Bundle B prompt: 上記「Bundle B」節を full text で渡す
  - Bundle C prompt: 上記「Bundle C」節を full text で渡す
```

### Dispatch prompt 共通注意

- 🚫 `git add / commit / push / reset / checkout / restore / stash` 全面禁止
- 🚫 JSDoc / コメントに「Phase X.Y」「P19」「Bundle A」等のタスク参照を含めない
- ✅ Implementer は編集のみ、commit は controller が完了後に Bundle 単位で実施
- ✅ import alias は `@/admin/*` / `@/public/*` / `@/shared/*` の 3 系統（`_shared/` プレフィックス二重禁止）
- ✅ plan の type 仕様（戻り値型 `affectedSlugs: string[]` 等）は維持。削減判断は controller に escalate
- ✅ 公式パターン違反疑いは justified deviation として報告
- ✅ 実装着手前に `Read` で参照実装（PostBulkActions / posts/bulk-commands.ts / actions/post/bulk.ts）を確認
- ✅ `invalidateSpaceCaches` 等 cache helper の正確な署名は実装ファイルを Read で確認
- ✅ `executeAdminMutationResult` の `action: "publish" | "delete"` は `@/admin/lib/admin-resources` の `Action` 型に実在することを Grep で事前確認

### Bundle 完了後の controller 検証

各 Bundle 完了報告を受けたら:

1. `git status --short` で実際の変更ファイル
2. `wc -l <new-files>` で行数 vs implementer 報告
3. `grep -E "^export" <new-files>` で期待 symbol 存在
4. `bun run type-check` で型整合
5. 上記 OK なら controller 側で `git add <files> && git commit -m "<plan 指定 message>"` でステージ + commit

### handoff memory 更新

3 Bundle 完了 + commit 後、`~/.claude/projects/<slug>/memory/project_p17-19-sequential-handoff.md` に以下追記:

```markdown
## P19 Phase 1 完了状態（参照のみ） ✅ 2026-04-27

- **Plan**: `docs/superpowers/plans/2026-04-27-admin-bulk-actions-phase1.md`
- **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase1-design.md`
- **commit 範囲**: `<base SHA>` → `<final SHA>` の 3 commit (Bundle A/B/C)
- **未 push**: main 直接 commit、`git push` は未実行
- **次フェーズ**: Phase 2 (customers / inquiries / coupons) を別 plan で実装
```

---

## Phase 2 / 3 への持ち越し（参考）

- **Phase 2**: customers / inquiries / coupons の bulk 操作（同型パターン、別 plan）
- **Phase 3**: 一括ステータス変更（CANCEL イベント + 参加者通知メール、状態遷移マップ整備）
- **Phase 4**: 一括カテゴリ移動・タグ付け（リソース横断機能）
