# Review Reply (店舗からの返信) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Space レビューに対して管理者が「店舗からの返信」を1件付与・編集・削除できるようにし、公開スペース詳細ページに返信を表示する。

**Architecture:** `SpaceReview` モデルに `replyBody` / `repliedAt` / `repliedByAdminId` の3カラムを追加（1レビュー1返信、join 不要）。ドメイン層に `replyToReview` / `deleteReviewReply` コマンドを追加し、`executeAdminMutationResult` パターンの Server Action 経由で管理画面から操作する。公開クエリ `getPublishedReviewsForSpace` に reply フィールドを含め、`space-reviews.tsx` でネスト表示。承認制は導入しない（既存の自動公開ポリシー維持）。

**Tech Stack:** Next.js 16 / React 19.2 / Prisma 7 / Zod 4 / Bun Test / React Hook Form / Tailwind 4.2

---

## File Structure

### 作成するファイル

- `__tests__/integration/actions/admin/review.test.ts` — 管理画面レビュー Server Action 統合テスト（新規）
- `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewReplyDialog.tsx` — 返信 Dialog（追加 / 編集 / 削除）
- `prisma/migrations/YYYYMMDDHHMMSS_add_space_review_reply/migration.sql` — 自動生成

### 変更するファイル

- `prisma/schema.prisma` — `SpaceReview` に 3 カラム追加
- `src/shared/domain/reviews/commands.ts` — `replyToReviewCommand` / `deleteReviewReplyCommand` 追加
- `src/shared/domain/reviews/queries.ts` — `reviewListSelect` と `formatReviewRow` に reply フィールド追加
- `src/shared/domain/reviews/public-queries.ts` — `getPublishedReviewsForSpace` の select に reply フィールド追加
- `src/shared/lib/validations/review.ts` — `reviewReplySchema` 追加
- `src/app/(admin)/admin/(dashboard)/_shared/actions/review.ts` — `replyToReview` / `deleteReviewReply` Server Action 追加
- `src/app/(admin)/admin/(dashboard)/_shared/queries/review.ts` — list クエリの戻り値型に reply フィールド追加
- `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTable.tsx` — reply 表示列 + Dialog トリガー
- `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewActionCell.tsx` — 「返信する / 返信を編集 / 返信を削除」メニュー追加
- `src/app/(public)/spaces/[slug]/_components/space-reviews.tsx` — reply のネスト表示
- `__tests__/unit/domain/reviews/commands.test.ts` — reply コマンドの unit テスト追加
- `package.json` — 新規テストバッチは既存 `__tests__/unit/domain/reviews` に収まるため追加不要（既存バッチを確認）

---

## Task 1: Prisma スキーマにレビュー返信カラムを追加

**Files:**

- Modify: `prisma/schema.prisma:1669-1688` — `SpaceReview` モデル

- [ ] **Step 1: schema.prisma に 3 カラムと relation を追加**

`prisma/schema.prisma` の `model SpaceReview { ... }` を以下の内容に差し替える（L1669-1688）:

```prisma
model SpaceReview {
  id            String   @id @default(uuid()) @db.Uuid
  spaceId       String   @db.Uuid
  customerId    String   @db.Uuid
  reservationId String   @unique @db.Uuid
  rating        Int
  title         String?  @db.VarChar(100)
  comment       String?  @db.VarChar(1000)
  isPublished   Boolean  @default(true)
  replyBody     String?  @db.VarChar(1000)
  repliedAt     DateTime?
  repliedByUserId String? @db.Uuid
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  space         Space       @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  customer      Customer    @relation(fields: [customerId], references: [id], onDelete: Cascade)
  reservation   Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  repliedByUser User?       @relation("SpaceReviewReplyAuthor", fields: [repliedByUserId], references: [id], onDelete: SetNull)

  @@index([spaceId, isPublished, createdAt(sort: Desc)])
  @@index([customerId])
  @@map("space_reviews")
}
```

- [ ] **Step 2: `User` モデルに逆リレーションを追加**

`prisma/schema.prisma` の `model User { ... }` 内のリレーション定義に以下を追加する（既存リレーションの直後）:

```prisma
  repliedSpaceReviews SpaceReview[] @relation("SpaceReviewReplyAuthor")
```

既存の他のリレーション定義（`createdBy`, `updatedBy`, `BlockTemplateCreator` 等）と同じブロックに配置する。

- [ ] **Step 3: マイグレーション生成**

Run: `bunx --bun prisma migrate dev --name add_space_review_reply`

Expected:

- `prisma/migrations/YYYYMMDDHHMMSS_add_space_review_reply/migration.sql` が生成される
- `ALTER TABLE "space_reviews" ADD COLUMN "replyBody" VARCHAR(1000)`, `"repliedAt" TIMESTAMP(3)`, `"repliedByUserId" UUID` を含む
- 全カラムが nullable なので既存データ破壊なし
- Prisma Client が自動再生成される

- [ ] **Step 4: dev サーバー再起動（起動中の場合のみ）**

gotchas.md: dev サーバーは db:generate 後も古い Prisma Client を保持する。稼働中なら `cmd //c "taskkill /PID <pid> /F /T"` → `bun dev` で再起動。未起動なら不要。

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: PASS。`SpaceReview` 型に `replyBody` / `repliedAt` / `repliedByUserId` が追加されている。

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/*add_space_review_reply*
git commit -m "feat(reviews): add reply columns to SpaceReview (replyBody/repliedAt/repliedByUserId)"
```

---

## Task 2: バリデーションスキーマ追加

**Files:**

- Modify: `src/shared/lib/validations/review.ts`

- [ ] **Step 1: `reviewReplySchema` を追加**

`src/shared/lib/validations/review.ts` の末尾に以下を追加する:

```typescript
export const reviewReplySchema = z.object({
  reviewId: z.string().uuid({ error: "レビューIDが不正です" }),
  replyBody: z
    .string({ error: "返信内容を入力してください" })
    .min(1, { error: "返信内容を入力してください" })
    .max(1000, { error: "返信は1000文字以内" }),
});

export type ReviewReplyInput = z.infer<typeof reviewReplySchema>;
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/validations/review.ts
git commit -m "feat(reviews): add reviewReplySchema for store reply"
```

---

## Task 3: ドメインコマンド — `replyToReviewCommand` TDD

**Files:**

- Modify: `__tests__/unit/domain/reviews/commands.test.ts`
- Modify: `src/shared/domain/reviews/commands.ts`

- [ ] **Step 1: 失敗するテストを追加**

`__tests__/unit/domain/reviews/commands.test.ts` の末尾に新しい `describe` ブロックを追加する:

```typescript
import {
  createReviewCommand,
  toggleReviewPublishedCommand,
  deleteReviewCommand,
  replyToReviewCommand,
  deleteReviewReplyCommand,
} from "@/shared/domain/reviews/commands";

// ... 既存テスト末尾に追加 ...

const ADMIN_USER_ID = "admin-user-1";

describe("replyToReviewCommand", () => {
  beforeEach(() => {
    mockSpaceReviewFindUnique.mockReset();
    mockSpaceReviewUpdate.mockReset();
    mockSpaceReviewFindUnique.mockResolvedValue(null);
    mockSpaceReviewUpdate.mockResolvedValue({ id: REVIEW_ID });
  });

  describe("正常系", () => {
    test("返信本文・repliedAt・repliedByUserId を保存して spaceId を返す", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await replyToReviewCommand({
        reviewId: REVIEW_ID,
        replyBody: "ご利用ありがとうございました。",
        adminUserId: ADMIN_USER_ID,
      });

      expect(result).toEqual({ spaceId: SPACE_ID });
      expect(mockSpaceReviewUpdate).toHaveBeenCalledTimes(1);
      expect(mockSpaceReviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: expect.objectContaining({
            replyBody: "ご利用ありがとうございました。",
            repliedByUserId: ADMIN_USER_ID,
            repliedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("既存の返信がある場合は上書き更新する（編集フロー）", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      await replyToReviewCommand({
        reviewId: REVIEW_ID,
        replyBody: "更新された返信",
        adminUserId: ADMIN_USER_ID,
      });

      expect(mockSpaceReviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ replyBody: "更新された返信" }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("レビューが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        replyToReviewCommand({
          reviewId: "non-existent",
          replyBody: "返信",
          adminUserId: ADMIN_USER_ID,
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "レビューが見つかりません",
      });
    });

    test("存在しないレビューでは update が呼ばれない", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        replyToReviewCommand({
          reviewId: "non-existent",
          replyBody: "返信",
          adminUserId: ADMIN_USER_ID,
        }),
      ).rejects.toThrow(DomainError);

      expect(mockSpaceReviewUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("deleteReviewReplyCommand", () => {
  beforeEach(() => {
    mockSpaceReviewFindUnique.mockReset();
    mockSpaceReviewUpdate.mockReset();
    mockSpaceReviewFindUnique.mockResolvedValue(null);
    mockSpaceReviewUpdate.mockResolvedValue({ id: REVIEW_ID });
  });

  describe("正常系", () => {
    test("replyBody / repliedAt / repliedByUserId を null にクリアして spaceId を返す", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await deleteReviewReplyCommand(REVIEW_ID);

      expect(result).toEqual({ spaceId: SPACE_ID });
      expect(mockSpaceReviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: {
            replyBody: null,
            repliedAt: null,
            repliedByUserId: null,
          },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("レビューが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        deleteReviewReplyCommand("non-existent"),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "レビューが見つかりません",
      });
    });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `bun test __tests__/unit/domain/reviews/commands.test.ts`
Expected: FAIL — `replyToReviewCommand is not a function` / `deleteReviewReplyCommand is not a function`

- [ ] **Step 3: `replyToReviewCommand` と `deleteReviewReplyCommand` を実装**

`src/shared/domain/reviews/commands.ts` の末尾（`deleteReviewCommand` の後）に以下を追加:

```typescript
type ReplyToReviewInput = {
  reviewId: string;
  replyBody: string;
  adminUserId: string;
};

export async function replyToReviewCommand(
  input: ReplyToReviewInput,
): Promise<{ spaceId: string }> {
  const review = await prisma.spaceReview.findUnique({
    where: { id: input.reviewId },
    select: { id: true, spaceId: true },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.update({
    where: { id: input.reviewId },
    data: {
      replyBody: input.replyBody,
      repliedAt: new Date(),
      repliedByUserId: input.adminUserId,
    },
  });

  return { spaceId: review.spaceId };
}

export async function deleteReviewReplyCommand(
  id: string,
): Promise<{ spaceId: string }> {
  const review = await prisma.spaceReview.findUnique({
    where: { id },
    select: { id: true, spaceId: true },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.update({
    where: { id },
    data: {
      replyBody: null,
      repliedAt: null,
      repliedByUserId: null,
    },
  });

  return { spaceId: review.spaceId };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `bun test __tests__/unit/domain/reviews/commands.test.ts`
Expected: PASS — 既存テスト + 新しい `replyToReviewCommand` / `deleteReviewReplyCommand` テスト全てグリーン

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/reviews/commands.ts __tests__/unit/domain/reviews/commands.test.ts
git commit -m "feat(reviews): add replyToReviewCommand and deleteReviewReplyCommand"
```

---

## Task 4: 管理画面クエリに reply フィールド追加

**Files:**

- Modify: `src/shared/domain/reviews/queries.ts`

- [ ] **Step 1: `reviewListSelect` と `formatReviewRow` に reply フィールドを追加**

`src/shared/domain/reviews/queries.ts` を以下のように変更:

`reviewListSelect` 定数（L6-17）に `replyBody`, `repliedAt`, `repliedByUser` を追加:

```typescript
const reviewListSelect = {
  id: true,
  spaceId: true,
  rating: true,
  title: true,
  comment: true,
  isPublished: true,
  replyBody: true,
  repliedAt: true,
  createdAt: true,
  space: { select: { id: true, name: true } },
  customer: { select: { id: true, lastName: true, firstName: true } },
  reservation: { select: { id: true } },
  repliedByUser: { select: { id: true, name: true } },
} as const;
```

`formatReviewRow` 関数を reply フィールドを返すように更新:

```typescript
function formatReviewRow(r: ReviewListRow) {
  return {
    id: r.id,
    spaceId: r.spaceId,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    isPublished: r.isPublished,
    replyBody: r.replyBody,
    repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
    repliedByUserName: r.repliedByUser?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    space: r.space,
    customer: {
      id: r.customer.id,
      lastName: r.customer.lastName,
      firstName: r.customer.firstName,
    },
    reservationId: r.reservation.id,
  };
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS。`getReviewsQuery` / `getReviewByIdQuery` の戻り値に reply フィールドが含まれる。

- [ ] **Step 3: Commit**

```bash
git add src/shared/domain/reviews/queries.ts
git commit -m "feat(reviews): include reply fields in admin review queries"
```

---

## Task 5: Server Action 追加（`replyToReview` / `deleteReviewReply`）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/review.ts`

- [ ] **Step 1: Server Action を追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/review.ts` の末尾に以下を追加。既存 import に `replyToReviewCommand`, `deleteReviewReplyCommand`, `reviewReplySchema` を追加する:

```typescript
"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  toggleReviewPublishedCommand,
  deleteReviewCommand,
  replyToReviewCommand,
  deleteReviewReplyCommand,
} from "@/shared/domain/reviews/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { reviewReplySchema } from "@/shared/lib/validations/review";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "レビューIDが不正です" });

// ... 既存 toggleReviewVisibility, deleteReview はそのまま ...

export async function replyToReview(input: unknown): Promise<MutationResult> {
  const parsed = reviewReplySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let spaceId: string | null = null;

  return executeAdminMutationResult({
    resource: "review",
    action: "update",
    resourceId: parsed.data.reviewId,
    execute: async (user) => {
      const result = await replyToReviewCommand({
        reviewId: parsed.data.reviewId,
        replyBody: parsed.data.replyBody,
        adminUserId: user.id,
      });
      spaceId = result.spaceId;
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.REVIEWS);
      if (spaceId) {
        updateTag(getCacheTag.reviews.space(spaceId));
        updateTag(getCacheTag.reviews.stats(spaceId));
      }
    },
  });
}

export async function deleteReviewReply(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let spaceId: string | null = null;

  return executeAdminMutationResult({
    resource: "review",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      const result = await deleteReviewReplyCommand(validated.data);
      spaceId = result.spaceId;
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.REVIEWS);
      if (spaceId) {
        updateTag(getCacheTag.reviews.space(spaceId));
        updateTag(getCacheTag.reviews.stats(spaceId));
      }
    },
  });
}
```

**完全なファイル内容を確認**: 既存の `toggleReviewVisibility` と `deleteReview` はそのまま保持し、import 文に追加・末尾に新しい2つのアクションを追加するだけ。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/review.ts
git commit -m "feat(reviews): add replyToReview and deleteReviewReply server actions"
```

---

## Task 6: Server Action 統合テスト

**Files:**

- Create: `__tests__/integration/actions/admin/review.test.ts`
- Modify: `package.json`（既存バッチに含まれているか確認）

- [ ] **Step 1: 既存テストバッチ確認**

Run: `grep "integration/actions/admin" package.json`
Expected: `bun test __tests__/integration/actions/admin` のようなバッチが存在する（新規ディレクトリ追加不要）。該当ファイルがすでにあれば追加しない。

- [ ] **Step 2: 統合テストファイルを作成**

`__tests__/integration/actions/admin/review.test.ts` を新規作成:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createMockSession } from "../../../mocks/auth";
import { Role } from "@generated/prisma/enums";

// Mocks
const mockGetSession = mock<() => Promise<unknown>>();
const mockReplyToReviewCommand = mock<() => Promise<{ spaceId: string }>>(() =>
  Promise.resolve({ spaceId: "space-1" }),
);
const mockDeleteReviewReplyCommand = mock<() => Promise<{ spaceId: string }>>(
  () => Promise.resolve({ spaceId: "space-1" }),
);
const mockLogAction = mock(() => Promise.resolve());
const mockUpdateTag = mock(() => {});

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: () => mockGetSession(),
  DASHBOARD_ROLES: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER],
}));

mock.module("@/shared/domain/reviews/commands", () => ({
  replyToReviewCommand: (input: unknown) => mockReplyToReviewCommand(input),
  deleteReviewReplyCommand: (id: unknown) => mockDeleteReviewReplyCommand(id),
  toggleReviewPublishedCommand: mock(),
  deleteReviewCommand: mock(),
}));

mock.module("@/admin/lib/audit", () => ({
  logAction: mockLogAction,
  logUserAction: mockLogAction,
  logPermissionDenied: mock(),
}));

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
  revalidateTag: mock(),
}));

mock.module("next/headers", () => ({
  headers: () => new Headers(),
}));

import {
  replyToReview,
  deleteReviewReply,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/review";
import { isMutationError } from "@/shared/lib/mutation-result";

const REVIEW_ID = "00000000-0000-4000-8000-000000000001";
const VALID_INPUT = {
  reviewId: REVIEW_ID,
  replyBody: "ご利用ありがとうございました。",
};

describe("replyToReview", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockReplyToReviewCommand.mockReset();
    mockReplyToReviewCommand.mockResolvedValue({ spaceId: "space-1" });
    mockUpdateTag.mockClear();
  });

  test("ADMIN は返信を投稿できる", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));

    const result = await replyToReview(VALID_INPUT);

    expect(isMutationError(result)).toBe(false);
    expect(mockReplyToReviewCommand).toHaveBeenCalledTimes(1);
  });

  test("reviewId が UUID でないとバリデーションエラー", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));

    const result = await replyToReview({
      reviewId: "not-a-uuid",
      replyBody: "返信",
    });

    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("replyBody が空文字列だとバリデーションエラー", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));

    const result = await replyToReview({ reviewId: REVIEW_ID, replyBody: "" });

    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("replyBody が 1001 文字だとバリデーションエラー", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));

    const result = await replyToReview({
      reviewId: REVIEW_ID,
      replyBody: "x".repeat(1001),
    });

    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("未認証はエラー", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await replyToReview(VALID_INPUT);

    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("成功時に REVIEWS / reviews.space / reviews.stats タグを無効化する", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));
    mockReplyToReviewCommand.mockResolvedValue({ spaceId: "space-1" });

    await replyToReview(VALID_INPUT);

    const calls = mockUpdateTag.mock.calls.map((c) => c[0]);
    expect(calls).toContain("reviews");
    expect(calls).toContain("reviews-space-space-1");
    expect(calls).toContain("reviews-stats-space-1");
  });
});

describe("deleteReviewReply", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockDeleteReviewReplyCommand.mockReset();
    mockDeleteReviewReplyCommand.mockResolvedValue({ spaceId: "space-1" });
    mockUpdateTag.mockClear();
  });

  test("ADMIN は返信を削除できる", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));

    const result = await deleteReviewReply(REVIEW_ID);

    expect(isMutationError(result)).toBe(false);
    expect(mockDeleteReviewReplyCommand).toHaveBeenCalledTimes(1);
  });

  test("reviewId が UUID でないとバリデーションエラー", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));

    const result = await deleteReviewReply("not-a-uuid");

    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("成功時にキャッシュタグを無効化する", async () => {
    mockGetSession.mockResolvedValue(createMockSession({ role: Role.ADMIN }));

    await deleteReviewReply(REVIEW_ID);

    const calls = mockUpdateTag.mock.calls.map((c) => c[0]);
    expect(calls).toContain("reviews");
    expect(calls).toContain("reviews-space-space-1");
    expect(calls).toContain("reviews-stats-space-1");
  });
});
```

> **注意**: 既存 `__tests__/integration/actions/admin/*.test.ts` のモック構成（`createMockSession`, `@/admin/lib/audit` の mock 対象等）を参照して同パターンに合わせること。`createMockSession` ヘルパーの import パスが違う場合は既存テストファイル（例: `space.test.ts`）のパスを踏襲する。

- [ ] **Step 3: 統合テスト実行**

Run: `bun test __tests__/integration/actions/admin/review.test.ts`
Expected: PASS — 全テストグリーン

- [ ] **Step 4: Commit**

```bash
git add __tests__/integration/actions/admin/review.test.ts
git commit -m "test(reviews): integration tests for reply server actions"
```

---

## Task 7: 公開クエリに reply フィールド追加

**Files:**

- Modify: `src/shared/domain/reviews/public-queries.ts:18-60`

- [ ] **Step 1: `getPublishedReviewsForSpace` の select に reply を追加**

`src/shared/domain/reviews/public-queries.ts` の `getPublishedReviewsForSpace` 関数の `prisma.spaceReview.findMany` の `select` 節に `replyBody`, `repliedAt` を追加し、戻り値 map に含める:

```typescript
export async function getPublishedReviewsForSpace(spaceId: string, limit = 5) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.REVIEWS, getCacheTag.reviews.space(spaceId));

  const reviews = await safeFetch({
    fetch: () =>
      prisma.spaceReview.findMany({
        where: {
          spaceId,
          isPublished: true,
          space: { reviewsEnabled: true },
        },
        select: {
          id: true,
          rating: true,
          title: true,
          comment: true,
          replyBody: true,
          repliedAt: true,
          createdAt: true,
          customer: { select: { lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedReviewsForSpace",
  });

  return toPlainArray(
    reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      replyBody: r.replyBody,
      repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      customerInitial: r.customer.lastName
        ? `${r.customer.lastName.charAt(0)}○`
        : "匿名",
    })),
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/domain/reviews/public-queries.ts
git commit -m "feat(reviews): expose reply fields in public space reviews query"
```

---

## Task 8: 公開ページで返信を表示

**Files:**

- Modify: `src/app/(public)/spaces/[slug]/_components/space-reviews.tsx`

- [ ] **Step 1: `replyBody` のネスト表示を追加**

各 `<article>` 内の既存 JSX（コメント表示の後、customerInitial の前）に以下のブロックを追加:

```tsx
{
  review.replyBody ? (
    <div className="mt-4 border-l-2 border-accent pl-4">
      <p className="mb-2 text-[0.7rem] uppercase tracking-[0.18em] text-accent">
        店舗からの返信
      </p>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {review.replyBody}
      </p>
      {review.repliedAt ? (
        <time
          className="mt-2 block text-xs text-muted-foreground"
          dateTime={review.repliedAt}
        >
          {formatSerializedDate(review.repliedAt)}
        </time>
      ) : null}
    </div>
  ) : null;
}
```

変更後の `<article>` 全体:

```tsx
<article
  key={review.id}
  className="border-b border-border pb-6 last:border-b-0"
>
  <div className="mb-2 flex items-center gap-3">
    <StarRating rating={review.rating} size={16} />
    <time className="text-xs text-muted-foreground" dateTime={review.createdAt}>
      {formatSerializedDate(review.createdAt)}
    </time>
  </div>
  {review.title ? <p className="mb-1 font-medium">{review.title}</p> : null}
  {review.comment ? (
    <p className="text-sm text-muted-foreground">{review.comment}</p>
  ) : null}
  <p className="mt-2 text-xs text-muted-foreground">{review.customerInitial}</p>
  {review.replyBody ? (
    <div className="mt-4 border-l-2 border-accent pl-4">
      <p className="mb-2 text-[0.7rem] uppercase tracking-[0.18em] text-accent">
        店舗からの返信
      </p>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {review.replyBody}
      </p>
      {review.repliedAt ? (
        <time
          className="mt-2 block text-xs text-muted-foreground"
          dateTime={review.repliedAt}
        >
          {formatSerializedDate(review.repliedAt)}
        </time>
      ) : null}
    </div>
  ) : null}
</article>
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\(public\)/spaces/\[slug\]/_components/space-reviews.tsx
git commit -m "feat(reviews): show store reply in public space detail"
```

---

## Task 9: 管理画面 ReviewReplyDialog コンポーネント作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewReplyDialog.tsx`

- [ ] **Step 1: Dialog コンポーネントを作成**

`src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewReplyDialog.tsx` を新規作成:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/admin/components/ui";
import { SubmitButton } from "@/admin/components/ui";
import {
  reviewReplySchema,
  type ReviewReplyInput,
} from "@/shared/lib/validations/review";
import { isMutationError } from "@/shared/lib/mutation-result";
import { replyToReview, deleteReviewReply } from "../../_shared/actions/review";

type ReviewReplyDialogProps = {
  reviewId: string;
  initialReplyBody: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewReplyDialog({
  reviewId,
  initialReplyBody,
  open,
  onOpenChange,
}: ReviewReplyDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const hasExistingReply = initialReplyBody !== null;

  const form = useForm<ReviewReplyInput>({
    resolver: zodResolver(reviewReplySchema),
    defaultValues: {
      reviewId,
      replyBody: initialReplyBody ?? "",
    },
  });

  const onSubmit = (data: ReviewReplyInput) => {
    startTransition(async () => {
      const result = await replyToReview(data);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        hasExistingReply ? "返信を更新しました" : "返信を投稿しました",
      );
      onOpenChange(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setIsDeleting(true);
    startTransition(async () => {
      const result = await deleteReviewReply(reviewId);
      setIsDeleting(false);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("返信を削除しました");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {hasExistingReply ? "返信を編集" : "レビューに返信"}
          </DialogTitle>
          <DialogDescription>
            店舗からの返信として公開されます（1000文字以内）
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="replyBody"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>返信内容</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={6}
                      maxLength={1000}
                      disabled={isPending}
                      placeholder="ご利用ありがとうございました。"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {hasExistingReply ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  {isDeleting ? "削除中..." : "返信を削除"}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2 sm:ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <SubmitButton
                  isPending={isPending && !isDeleting}
                  label={hasExistingReply ? "返信を更新" : "返信を投稿"}
                  pendingLabel={hasExistingReply ? "更新中..." : "投稿中..."}
                />
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

> **注意**: `@/admin/components/ui` から import する Dialog / Form / Textarea / SubmitButton 等は既存の同名 primitive を使う。存在しない場合は同ディレクトリの別コンポーネント（例: `SpaceEditForm.tsx`）の import 文を参考にパスを調整する。`toast` は `sonner` が既存で使われている場合はそのまま、そうでなければ既存プロジェクトの toast ヘルパーを使う。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/spaces/_components/ReviewReplyDialog.tsx
git commit -m "feat(reviews): add ReviewReplyDialog for admin reply management"
```

---

## Task 10: ReviewActionCell に返信メニュー追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewActionCell.tsx`

- [ ] **Step 1: 既存ファイルを読む**

既存の `ReviewActionCell.tsx` 内容を確認する（現状 publish トグル + delete だけのはず）。

- [ ] **Step 2: props に reply 情報を追加し、Dialog を統合**

`ReviewActionCell.tsx` を以下のように変更:

```tsx
"use client";

import { useState } from "react";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { ReviewReplyDialog } from "./ReviewReplyDialog";
import {
  toggleReviewVisibility,
  deleteReview,
} from "../../_shared/actions/review";
// 既存の他 import は保持

type ReviewActionCellProps = {
  reviewId: string;
  isPublished: boolean;
  replyBody: string | null;
};

export function ReviewActionCell({
  reviewId,
  isPublished,
  replyBody,
}: ReviewActionCellProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hasReply = replyBody !== null;

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem onClick={() => setReplyOpen(true)}>
          {hasReply ? "返信を編集" : "返信する"}
        </ActionDropdownItem>
        {/* 既存の公開/非公開トグル項目はそのまま保持 */}
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          レビューを削除
        </ActionDropdownItem>
      </ActionDropdown>
      <ReviewReplyDialog
        reviewId={reviewId}
        initialReplyBody={replyBody}
        open={replyOpen}
        onOpenChange={setReplyOpen}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="レビュー"
        onConfirm={async () => {
          await deleteReview(reviewId);
        }}
      />
    </>
  );
}
```

> **注意**: 既存 `ReviewActionCell.tsx` が持つ「公開/非公開トグル」のロジックを消さない。`toggleReviewVisibility` 呼び出しは既存のまま維持し、`ReviewReplyDialog` と `hasReply` 判定のみ新規追加する。既存実装を読んでから差分のみ適用する。

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS — `replyBody` prop が ReviewTable 側で渡されていないので一時的にエラーになる。Task 11 で解決する。先に進む。

- [ ] **Step 4: Commit（Task 11 と同時 commit でも可）**

この時点では ReviewTable の変更と分離しても型エラーが残るため、Task 11 まで進めてから一括 commit する。

---

## Task 11: ReviewTable に reply 情報を渡す

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTable.tsx`

- [ ] **Step 1: `ReviewRow` 型と JSX を更新**

`ReviewRow` 型に `replyBody` フィールドを追加:

```typescript
type ReviewRow = {
  id: string;
  spaceId: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isPublished: boolean;
  replyBody: string | null;
  createdAt: string;
  space: { id: string; name: string };
  customer: { id: string; lastName: string; firstName: string };
  reservationId: string;
};
```

`<ReviewActionCell>` 呼び出しに `replyBody` を渡す:

```tsx
<ReviewActionCell
  reviewId={review.id}
  isPublished={review.isPublished}
  replyBody={review.replyBody}
/>
```

「公開状態」列の Badge の直後に「返信済み」バッジ列を追加（または同じセル内に追加）:

```tsx
<TableCell className="whitespace-nowrap">
  <Badge variant={review.isPublished ? "success" : "secondary"}>
    {review.isPublished ? "公開" : "非公開"}
  </Badge>
  {review.replyBody ? (
    <Badge variant="info" className="ml-2">
      返信済み
    </Badge>
  ) : null}
</TableCell>
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Lint 確認**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 4: Commit（Task 10 と統合）**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/spaces/_components/ReviewActionCell.tsx src/app/\(admin\)/admin/\(dashboard\)/spaces/_components/ReviewTable.tsx
git commit -m "feat(reviews): wire ReviewReplyDialog into admin review table"
```

---

## Task 12: 全体検証

- [ ] **Step 1: 全テスト実行**

Run: `bun run test`
Expected: PASS — 既存テスト全てグリーン、新規追加テストもグリーン

- [ ] **Step 2: Validate（type-check + lint）**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: ビルド検証**

Run: `bun run validate && bun run build`
Expected: PASS — Turbopack ビルドが成功

- [ ] **Step 4: 手動確認（dev サーバー）**

Run: `bun dev`

確認項目:

1. 管理画面 `/admin/spaces?tab=reviews` にアクセス → レビュー一覧が表示される
2. 任意のレビューで「返信する」アクションを選択 → Dialog 開く
3. 返信本文を入力して「返信を投稿」 → toast 成功表示 → 一覧に「返信済み」バッジ追加
4. 同じレビューで「返信を編集」 → Dialog に既存本文がプリフィル
5. 「返信を削除」ボタン → toast 成功 → バッジ消える
6. 公開ページ `/spaces/<slug>` にアクセス → レビューセクションに「店舗からの返信」が表示される（返信済みレビューのみ）
7. バリデーション: 空文字送信 → エラー表示。1001 文字送信 → エラー表示
8. モバイル幅 (375px) で Dialog が崩れないこと

問題があれば該当 Task に戻って修正。

- [ ] **Step 5: 最終 commit（差分があれば）**

微修正が必要だった場合のみ追加 commit。

---

## 補足: このプランで扱わないこと（YAGNI）

- **承認制**: レビューは引き続き自動公開（既存ポリシー維持）
- **複数返信**: 1 レビュー 1 返信。将来必要になったら別テーブルに分離
- **顧客へのメール通知**: 返信投稿時の顧客向け通知は**今回のスコープ外**。必要になったら別プランで `fireAndForget` + メールテンプレートで追加
- **管理通知**: 返信は管理者起点の操作のため `AdminNotification` は生成しない（予約・レビュー投稿時のみ既存通り生成）
- **マイページでの返信表示**: 予約詳細ページの `review-display.tsx` に返信を表示する拡張は別タスク（必要になったら追加）
- **E2E テスト**: 統合テスト + 手動確認で十分。Playwright 追加は別タスク
