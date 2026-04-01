# Test Coverage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ドメインコマンド・管理Actions・API Routes のテストカバレッジを全面拡充し、ビジネスロジック核心部分の品質を担保する。

**Architecture:** 全テストは `bun:test` で記述。ドメインコマンドは `mock.module` で prisma を差し替え、Server Actions はさらに auth・cache 等も差し替える統合テスト。API Routes は Request/Response をモックして直接呼び出し。純粋定数モジュール（`@/shared/lib/constants`）はモックせず実物を使用。

**Tech Stack:** Bun Test (`bun:test`), Zod 4, Prisma 7 mapped enums, DomainError

**テスト方針:**

- `mock.module` は import より前に配置（TDZ 回避）
- モック関数は型パラメータ明示: `mock<() => Promise<T>>()`
- `@/shared/lib/constants` はモック不要（副作用なし）
- `server-only` は `__tests__/setup.ts` のプリロードで対応済み
- テスト名は日本語、`describe` で正常系/異常系を分離

**ファイル命名規則:**

- ドメインコマンド: `__tests__/unit/domain/<domain>/commands.test.ts`
- 管理 Actions: `__tests__/integration/actions/admin/<resource>.test.ts`（既存テストに追加）
- API Routes: `__tests__/unit/api/<route-name>.test.ts`

---

## Phase 1: ドメインコマンド（最重要 — ビジネスロジック核心）

### Task 1: reviews/commands テスト

**Files:**

- Create: `__tests__/unit/domain/reviews/commands.test.ts`
- Reference: `src/shared/domain/reviews/commands.ts`

- [ ] **Step 1: テストファイル作成 — createReviewCommand**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { ReservationStatus } from "@/shared/db/enums";

// =============================================================================
// Prisma モック
// =============================================================================

const mockFindUniqueReservation = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockCreateReview = mock<() => Promise<{ id: string; spaceId: string }>>(
  () => Promise.resolve({ id: "review-001", spaceId: "space-001" }),
);

const mockFindUniqueReview = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockUpdateReview = mock<() => Promise<void>>(() => Promise.resolve());

const mockDeleteReview = mock<() => Promise<void>>(() => Promise.resolve());

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: { findUnique: mockFindUniqueReservation },
    spaceReview: {
      create: mockCreateReview,
      findUnique: mockFindUniqueReview,
      update: mockUpdateReview,
      delete: mockDeleteReview,
    },
  },
}));

import {
  createReviewCommand,
  toggleReviewPublishedCommand,
  deleteReviewCommand,
} from "@/shared/domain/reviews/commands";

// =============================================================================
// テストデータ
// =============================================================================

const VALID_INPUT = {
  customerId: "customer-001",
  reservationId: "reservation-001",
  rating: 4,
  title: "素晴らしいスペース",
  comment: "清潔で快適でした",
};

const VALID_RESERVATION = {
  id: "reservation-001",
  customerId: "customer-001",
  spaceId: "space-001",
  status: ReservationStatus.COMPLETED,
  review: null,
};

// =============================================================================
// テスト
// =============================================================================

describe("createReviewCommand", () => {
  beforeEach(() => {
    mockFindUniqueReservation.mockClear();
    mockCreateReview.mockClear();
    mockFindUniqueReservation.mockImplementation(() =>
      Promise.resolve(VALID_RESERVATION),
    );
    mockCreateReview.mockImplementation(() =>
      Promise.resolve({ id: "review-001", spaceId: "space-001" }),
    );
  });

  describe("正常系", () => {
    test("有効な入力でレビューが作成される", async () => {
      const result = await createReviewCommand(VALID_INPUT);
      expect(result).toEqual({ id: "review-001", spaceId: "space-001" });
    });

    test("title と comment が null でも作成される", async () => {
      const result = await createReviewCommand({
        ...VALID_INPUT,
        title: null,
        comment: null,
      });
      expect(result.id).toBe("review-001");
    });
  });

  describe("異常系", () => {
    test("予約が存在しない場合 NOT_FOUND エラー", async () => {
      mockFindUniqueReservation.mockImplementation(() => Promise.resolve(null));
      await expect(createReviewCommand(VALID_INPUT)).rejects.toThrow(
        DomainError,
      );
    });

    test("他人の予約には UNAUTHORIZED エラー", async () => {
      mockFindUniqueReservation.mockImplementation(() =>
        Promise.resolve({ ...VALID_RESERVATION, customerId: "other-customer" }),
      );
      await expect(createReviewCommand(VALID_INPUT)).rejects.toThrow(
        "この予約にレビューを投稿する権限がありません",
      );
    });

    test("未完了の予約には VALIDATION エラー", async () => {
      mockFindUniqueReservation.mockImplementation(() =>
        Promise.resolve({
          ...VALID_RESERVATION,
          status: ReservationStatus.PENDING,
        }),
      );
      await expect(createReviewCommand(VALID_INPUT)).rejects.toThrow(
        "完了済みの予約のみレビューを投稿できます",
      );
    });

    test("既にレビュー済みなら CONFLICT エラー", async () => {
      mockFindUniqueReservation.mockImplementation(() =>
        Promise.resolve({ ...VALID_RESERVATION, review: { id: "existing" } }),
      );
      await expect(createReviewCommand(VALID_INPUT)).rejects.toThrow(
        "この予約には既にレビューが投稿されています",
      );
    });
  });
});

describe("toggleReviewPublishedCommand", () => {
  beforeEach(() => {
    mockFindUniqueReview.mockClear();
    mockUpdateReview.mockClear();
    mockFindUniqueReview.mockImplementation(() =>
      Promise.resolve({ id: "review-001", spaceId: "space-001" }),
    );
  });

  test("存在するレビューの公開状態を切り替え", async () => {
    const result = await toggleReviewPublishedCommand("review-001", true);
    expect(result).toEqual({ spaceId: "space-001" });
    expect(mockUpdateReview).toHaveBeenCalledTimes(1);
  });

  test("存在しないレビューで NOT_FOUND エラー", async () => {
    mockFindUniqueReview.mockImplementation(() => Promise.resolve(null));
    await expect(toggleReviewPublishedCommand("xxx", true)).rejects.toThrow(
      "レビューが見つかりません",
    );
  });
});

describe("deleteReviewCommand", () => {
  beforeEach(() => {
    mockFindUniqueReview.mockClear();
    mockDeleteReview.mockClear();
    mockFindUniqueReview.mockImplementation(() =>
      Promise.resolve({ id: "review-001", spaceId: "space-001" }),
    );
  });

  test("存在するレビューを削除", async () => {
    const result = await deleteReviewCommand("review-001");
    expect(result).toEqual({ spaceId: "space-001" });
    expect(mockDeleteReview).toHaveBeenCalledTimes(1);
  });

  test("存在しないレビューで NOT_FOUND エラー", async () => {
    mockFindUniqueReview.mockImplementation(() => Promise.resolve(null));
    await expect(deleteReviewCommand("xxx")).rejects.toThrow(
      "レビューが見つかりません",
    );
  });
});
```

- [ ] **Step 2: テスト実行して全パスを確認**

Run: `bun test __tests__/unit/domain/reviews/commands.test.ts`
Expected: 全テスト PASS

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/domain/reviews/commands.test.ts
git commit -m "test(domain): add reviews/commands unit tests"
```

### Task 2: coupons/commands テスト

**Files:**

- Create: `__tests__/unit/domain/coupons/commands.test.ts`
- Reference: `src/shared/domain/coupons/commands.ts`

- [ ] **Step 1: テストファイル作成**

`src/shared/domain/coupons/commands.ts` を読み、全 export 関数（createCoupon, updateCoupon, deleteCoupon, toggleCouponActive, incrementCouponUsage, decrementCouponUsage）のテストを作成。

パターン:

- Prisma の `coupon.findUnique`, `coupon.findFirst`, `coupon.create`, `coupon.update`, `coupon.delete`, `coupon.updateMany` をモック
- 正常系: 有効な入力で作成/更新/削除が成功
- 異常系: 存在しない ID → NOT_FOUND、重複コード → CONFLICT
- incrementCouponUsage / decrementCouponUsage: usageCount の正しい操作

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 3: customers/commands テスト

**Files:**

- Create: `__tests__/unit/domain/customers/commands.test.ts`
- Reference: `src/shared/domain/customers/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createCustomer, updateCustomerStatus, updateCustomerNotes, toggleCustomerActive, updateCustomer, updateCustomerProfileByUserId, deleteCustomer

パターン:

- 正常系: 各操作が正しく Prisma を呼び出す
- 異常系: 存在しない顧客 → DomainError
- updateCustomerProfileByUserId: userId で検索 → 更新

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 4: spaces/commands テスト

**Files:**

- Create: `__tests__/unit/domain/spaces/commands.test.ts`
- Reference: `src/shared/domain/spaces/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createSpaceCommand, updateSpaceCommand, updateSpacePublishCommand, deleteSpaceCommand, toggleSpacePublishedCommand

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 5: locations/commands テスト

**Files:**

- Create: `__tests__/unit/domain/locations/commands.test.ts`
- Reference: `src/shared/domain/locations/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createLocation, updateLocation, toggleLocationPublish, updateLocationOrder, deleteLocation, hardDeleteLocation

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 6: posts/commands テスト

**Files:**

- Create: `__tests__/unit/domain/posts/commands.test.ts`
- Reference: `src/shared/domain/posts/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createPost, updatePost, deletePost, publishPost, unpublishPost, createPostBackup, restorePostVersion, createPostCategory, updatePostCategory, deletePostCategory, updatePostCategoryOrder, createPostTag, updatePostTag, deletePostTag

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 7: news/commands テスト

**Files:**

- Create: `__tests__/unit/domain/news/commands.test.ts`
- Reference: `src/shared/domain/news/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createNews, updateNews, deleteNews, publishNews, unpublishNews, createNewsBackup, restoreNewsVersion

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 8: inquiries/commands テスト

**Files:**

- Create: `__tests__/unit/domain/inquiries/commands.test.ts`
- Reference: `src/shared/domain/inquiries/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: updateInquiryStatus, replyToInquiryCommand, deleteInquiry, createInquiryCommand

- createInquiryCommand の 3段 Customer 紐づけ（customerId > email一致 > null）をテスト

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 9: pages/commands テスト

**Files:**

- Create: `__tests__/unit/domain/pages/commands.test.ts`
- Reference: `src/shared/domain/pages/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createPageIfNotExistsCommand, ensureSystemPageCommand, updatePageCommand, createPageCommand, deletePageCommand, deletePagePermanentlyCommand, restorePageCommand, togglePagePublishedCommand, bulkTogglePagePublishedCommand, bulkDeletePagesCommand, updatePageSeoCommand

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 10: faq/commands テスト

**Files:**

- Create: `__tests__/unit/domain/faq/commands.test.ts`
- Reference: `src/shared/domain/faq/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createFaqCategory, updateFaqCategory, deleteFaqCategory, reorderFaqCategories, createFaqItem, updateFaqItem, deleteFaqItem, reorderFaqItems, toggleFaqItemPublished

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 11: navigation/commands テスト

**Files:**

- Create: `__tests__/unit/domain/navigation/commands.test.ts`
- Reference: `src/shared/domain/navigation/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createNavigationItem, updateNavigationItem, deleteNavigationItem, updateNavigationOrder, createSocialLink, updateSocialLink, deleteSocialLink, updateSocialLinkOrder

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 12: terms/commands テスト

**Files:**

- Create: `__tests__/unit/domain/terms/commands.test.ts`
- Reference: `src/shared/domain/terms/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createTerms, createTermsWithVersion, updateTerms, deleteTerms, toggleTermsActive, createTermsVersion, updateTermsVersion, publishTermsVersion, archiveTermsVersion, deleteTermsVersion

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 13: users/commands テスト

**Files:**

- Create: `__tests__/unit/domain/users/commands.test.ts`
- Reference: `src/shared/domain/users/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createUser, updateUser, deleteUser, updateUserRole

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 14: space-categories/commands テスト

**Files:**

- Create: `__tests__/unit/domain/space-categories/commands.test.ts`
- Reference: `src/shared/domain/space-categories/commands.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: createSpaceCategory, updateSpaceCategory, updateSpaceCategoryOrder, deleteSpaceCategory, hardDeleteSpaceCategory

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 15: settings/commands テスト

**Files:**

- Create: `__tests__/unit/domain/settings/commands.test.ts`
- Reference: `src/shared/domain/settings/commands.ts`

- [ ] **Step 1: テストファイル作成**

主要な update 関数（updateBasicInfo, updateBusinessInfo, updateReservationSettings, updateDiscountSettings, updateTaxSettings 等）のテスト。全22関数だが、パターンが同一（findFirstOrThrow → update）のため代表的な5-6関数をテスト。

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 16: 残りのドメインコマンドテスト（バッチ）

**Files:**

- Create: `__tests__/unit/domain/sections/commands.test.ts`
- Create: `__tests__/unit/domain/media/commands.test.ts`
- Create: `__tests__/unit/domain/staff-invitations/commands.test.ts`
- Create: `__tests__/unit/domain/post-comments/commands.test.ts`
- Create: `__tests__/unit/domain/block-template/commands.test.ts`
- Create: `__tests__/unit/domain/editor-comments/commands.test.ts`
- Create: `__tests__/unit/domain/instagram/commands.test.ts`

各ファイルの export 関数を読み、正常系・異常系（NOT_FOUND）をテスト。

- [ ] **Step 1: 各テストファイル作成**
- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

---

## Phase 2: 管理 Server Actions（未テスト分）

### Task 17: admin review Action テスト

**Files:**

- Create: `__tests__/integration/actions/admin/review.test.ts`
- Reference: `src/app/(admin)/admin/(dashboard)/_shared/actions/review.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: toggleReviewVisibility, deleteReview
mock.module パターンで executeAdminMutationResult, reviews/commands, next/cache をモック。

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 18: admin settings 統合テスト拡充

**Files:**

- Reference: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`
- Modify: `__tests__/integration/actions/admin/settings-basic.test.ts`（既存にケース追加）

settings Actions の多くはテスト済みだが、`settings/index.ts` の dispatch 関数のバリデーション部分を検証。

- [ ] **Step 1: 既存テストにバリデーション異常系を追加**
- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

---

## Phase 3: API Routes（未テスト分 — 重要度中）

### Task 19: admin export customers API テスト

**Files:**

- Create: `__tests__/unit/api/admin-export-customers-route.test.ts`
- Reference: `src/app/api/admin/export/customers/route.ts`

- [ ] **Step 1: テストファイル作成**

既存の `admin-export-reservations.test.ts` パターンに従い、GET ハンドラのテスト。
checkPermission, getCustomersForExport をモック。

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 20: admin API Routes バッチテスト

以下の admin API Routes は全て GET のみの読み取り API で、パターンが同一（checkPermission → query → Response.json）。

**Files:**

- Create: `__tests__/unit/api/admin-announcement-bars-route.test.ts`
- Create: `__tests__/unit/api/admin-block-templates-route.test.ts`
- Create: `__tests__/unit/api/admin-customers-search-route.test.ts`
- Create: `__tests__/unit/api/admin-homepage-sections-route.test.ts`
- Create: `__tests__/unit/api/admin-navigation-route.test.ts`
- Create: `__tests__/unit/api/admin-page-sections-route.test.ts`

各ファイル: checkPermission 成功→データ返却、失敗→403 をテスト。

- [ ] **Step 1: 各テストファイル作成**
- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 21: Instagram OAuth Routes テスト

**Files:**

- Create: `__tests__/unit/api/instagram-oauth-authorize-route.test.ts`
- Create: `__tests__/unit/api/instagram-oauth-callback-route.test.ts`

- [ ] **Step 1: テストファイル作成**

authorize: redirect URL 生成のテスト
callback: トークン交換成功/失敗のテスト

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

---

## Phase 4: payment-queries / reservations 決済テスト

### Task 22: reservations/payment-queries テスト

**Files:**

- Create: `__tests__/unit/domain/reservations/payment-queries.test.ts`
- Reference: `src/shared/domain/reservations/payment-queries.ts`

- [ ] **Step 1: テストファイル作成**

export 関数: getReservationPaymentStatus, updateReservationPaymentCompleted, markReservationPaymentFailed, findReservationByPaymentIntent, savePaymentIntentId, markReservationRefunded

- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

### Task 23: settings/integration-commands テスト

**Files:**

- Create: `__tests__/unit/domain/settings/integration-commands.test.ts`
- Reference: `src/shared/domain/settings/integration-commands.ts`

Stripe 接続テスト, Google Calendar 設定, iCal トークン管理等の外部連携コマンド。

- [ ] **Step 1: テストファイル作成**
- [ ] **Step 2: テスト実行して全パスを確認**
- [ ] **Step 3: コミット**

---

## Phase 5: test スクリプト更新 & 最終検証

### Task 24: package.json test スクリプト更新

**Files:**

- Modify: `package.json`

新しく追加したドメインテストディレクトリが `bun run test` で実行されることを確認。
`__tests__/unit/domain/` は既に test スクリプトに含まれている。

- [ ] **Step 1: `bun run test` で全テスト 0 fail を確認**
- [ ] **Step 2: `bun run validate` で型チェック・lint パスを確認**
- [ ] **Step 3: 最終コミット**

```bash
git add -A
git commit -m "test: comprehensive test coverage expansion for domain commands, admin actions, and API routes"
```

---

## 対象外（テスト不要）

以下はテスト投資対効果が低いため対象外:

- **queries.ts（読み取り系）**: Prisma の select 構造をモックしても実質 Prisma API のテストになる。DB統合テスト（E2E）で検証すべき
- **純粋型定義ファイル**: types.ts, index.ts（barrel）
- **CSS/レイアウト関連**: コンポーネントの視覚テストは E2E で担保
- **settings/commands の残り17関数**: 全て同一パターン（findFirstOrThrow → update）のため代表テストで十分
