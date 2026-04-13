# レビュー管理 スペース統合 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/reviews` を独立ルートから `/admin/spaces?tab=reviews` のタブへ完全統合し、同時に Space モデルに `reviewsEnabled` トグルを追加して、スペース単位でレビュー機能を ON/OFF できるようにする。

**Architecture:** スペース管理ハブ (`/admin/spaces`) の既存タブパターン B（`SearchParamsCache` + `Link` ベースのフルナビ）に 4 つ目のタブとして reviews を追加する。URL パラメータは `rv*` プレフィックスで `adminSpaceSearchParamsParsers` に統合し、`adminReviewSearchParamsParsers` は削除。`/admin/reviews` ルートは**完全削除**（redirect なし）、通知リンク・サイドバー・`notification-helpers` を一括更新し、既存 `AdminNotification` レコードの `linkUrl` は SQL データマイグレーションで書き換える。公開側は `Space.reviewsEnabled` で詳細ページ表示・投稿フォーム・`createReviewCommand` すべてをガード。

**Tech Stack:** Next.js 16 / React 19 / Prisma 7 / Zod 4 / nuqs 2 / TypeScript 6

**破壊的変更ポリシー:** リダイレクト・別名エイリアス・後方互換シムは作らない。古い URL `/admin/reviews` にアクセスすると 404。古い `linkUrl` は DB マイグレーションで新 URL に書き換える。

---

## File Structure

### 新規作成

| パス                                                                                             | 責務                                                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `prisma/migrations/YYYYMMDDHHMMSS_add_space_reviews_enabled_and_move_review_links/migration.sql` | `spaces.reviews_enabled` カラム追加 + 既存通知 `link_url` 更新                        |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTabContent.tsx`                      | Reviews タブの Server Component（一覧取得 + フィルタ + テーブル）                     |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewFilters.tsx`                         | Reviews タブ用フィルタ（`rv*` パーサー使用）                                          |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTable.tsx`                           | Reviews タブ用テーブル（旧 `reviews/_components/ReviewTable.tsx` の移設）             |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewActionCell.tsx`                      | Reviews タブ用 ActionDropdown（旧 `reviews/_components/ReviewActionCell.tsx` の移設） |

### 変更

| パス                                                                                              | 変更内容                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                            | `Space.reviewsEnabled Boolean @default(true)` 追加                                                                                                                          |
| `prisma/seed.ts`                                                                                  | seed スペースに `reviewsEnabled: true`（省略可だがテストで明示性確保）                                                                                                      |
| `src/shared/lib/constants/admin-space-management.ts`                                              | `ADMIN_SPACE_MANAGEMENT_TABS` に `"reviews"` 追加                                                                                                                           |
| `src/shared/lib/nuqs/parsers.ts`                                                                  | `adminSpaceSearchParamsParsers` に `rv*` 追加、`adminReviewSearchParamsParsers` と `loadAdminReviewSearchParams` 削除、`loadAdminSpaceSearchParams` から `reviews` タブ対応 |
| `src/shared/lib/nuqs/index.ts`                                                                    | `adminReviewSearchParamsParsers` / `loadAdminReviewSearchParams` の export 削除                                                                                             |
| `src/app/(admin)/admin/(dashboard)/spaces/page.tsx`                                               | `tabPanel()` の switch に `reviews` ケース追加 + ヘッダー説明文更新                                                                                                         |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceManagementTabs.tsx`                    | `TAB_ITEMS` に `reviews` エントリ追加、`activeTab === "reviews"` での右端ボタン非表示                                                                                       |
| `src/app/(admin)/admin/(dashboard)/_shared/queries/review.ts`                                     | `getReviews` の `filters` に `spaceId` を露出（既にクエリ関数では対応済み）                                                                                                 |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/notification-helpers.ts`                           | `review` ルート → `/admin/spaces?tab=reviews`                                                                                                                               |
| `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`                                 | 「レビュー」項目の `href` → `/admin/spaces?tab=reviews`                                                                                                                     |
| `src/shared/domain/spaces/queries.ts`                                                             | `formatSpaceToPlain` / `spaceSelect` / `SpaceWithStats`（admin 側型）に `reviewsEnabled` 追加                                                                               |
| `src/shared/domain/spaces/public-queries.ts`                                                      | `getSpaceBySlug` 等の select に `reviewsEnabled` 追加                                                                                                                       |
| `src/shared/domain/spaces/commands.ts`                                                            | `createSpaceCommand` / `updateSpaceCommand` で `reviewsEnabled` を受け付ける                                                                                                |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts`                              | `spaceFormSchema` に `reviewsEnabled` 追加、`defaultSpaceFormValues` に `true`、`SpaceWithStats` に `reviewsEnabled`                                                        |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts`                  | `spaceEditFormSchema` に `reviewsEnabled` 追加、`spaceEditFormDataToSpaceFormPayload` と `TAB_FIELDS.publish` 更新                                                          |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/publish-tab-panel.tsx` | レビュー ON/OFF Switch カード追加                                                                                                                                           |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/space-form-data-codec.ts`                          | `reviewsEnabled` を codec 両方向で扱う                                                                                                                                      |
| `src/shared/domain/reviews/commands.ts`                                                           | `createReviewCommand` 冒頭で `space.reviewsEnabled` チェック → `DomainError("このスペースではレビュー投稿が無効化されています", "VALIDATION")`                              |
| `src/shared/domain/reviews/public-queries.ts`                                                     | `getSpaceReviewStats` / `getPublishedReviewsForSpace` の `where` に `space: { reviewsEnabled: true }` 追加                                                                  |
| `src/app/(public)/spaces/[slug]/page.tsx`                                                         | `space.reviewsEnabled` で `<SpaceReviews />` と `aggregateRating` 分岐                                                                                                      |
| `src/app/(public)/spaces/[slug]/_components/space-reviews.tsx`                                    | `if (!reviewsEnabled) return null` ガード（props 追加）                                                                                                                     |
| `src/app/(public)/spaces/page.tsx`                                                                | `reviewsEnabled=false` のスペースを `getSpaceReviewStatsMultiple` から除外                                                                                                  |
| `src/app/(public)/mypage/reservations/[id]/page.tsx`                                              | `space.reviewsEnabled` を取得し `<ReviewForm />` 描画分岐                                                                                                                   |
| `src/app/(public)/mypage/reservations/[id]/_components/review-form.tsx`                           | `reviewsEnabled=false` で投稿不可メッセージ表示                                                                                                                             |

### 削除

| パス                                                                         | 理由                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/reviews/page.tsx`                         | 完全統合により不要                                                   |
| `src/app/(admin)/admin/(dashboard)/reviews/loading.tsx`                      | 同上                                                                 |
| `src/app/(admin)/admin/(dashboard)/reviews/error.tsx`                        | 同上                                                                 |
| `src/app/(admin)/admin/(dashboard)/reviews/_components/ReviewTable.tsx`      | spaces/\_components/ に移設                                          |
| `src/app/(admin)/admin/(dashboard)/reviews/_components/ReviewFilters.tsx`    | spaces/\_components/ に移設                                          |
| `src/app/(admin)/admin/(dashboard)/reviews/_components/ReviewActionCell.tsx` | spaces/\_components/ に移設                                          |
| `src/app/(admin)/admin/(dashboard)/reviews/` ディレクトリ全体                | 空になるため `python3 -c "import shutil; shutil.rmtree(...)"` で削除 |

---

## Task 1: Space モデルに `reviewsEnabled` カラム追加 + マイグレーション

**Files:**

- Modify: `prisma/schema.prisma` (Space model)
- Create: `prisma/migrations/YYYYMMDDHHMMSS_add_space_reviews_enabled/migration.sql`

- [ ] **Step 1: schema.prisma に `reviewsEnabled` を追加**

`prisma/schema.prisma` の `Space` model、`isActive Boolean @default(true)` の直後に以下を追加:

```prisma
model Space {
  // ... 既存フィールド ...
  isActive      Boolean   @default(true)
  /// レビュー機能の ON/OFF。false の場合は公開ページで非表示 + 投稿不可。
  reviewsEnabled Boolean  @default(true) @map("reviews_enabled")
  // ... 既存 ...
}
```

- [ ] **Step 2: マイグレーション生成（対話不可環境なので diff + db execute）**

Run:

```bash
bunx --bun prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script > /tmp/migration-preview.sql
cat /tmp/migration-preview.sql
```

Expected: `ALTER TABLE "spaces" ADD COLUMN "reviews_enabled" BOOLEAN NOT NULL DEFAULT true;` のみ含まれること。他の差分があればスキーマ側の意図しない変更を調査。

- [ ] **Step 3: 通常のマイグレーションコマンドで適用**

対話可能な環境ならこちらが優先:

```bash
bunx --bun prisma migrate dev --name add_space_reviews_enabled
```

Expected: `generated/prisma` が再生成され、`reviews_enabled` カラムが DB に追加される。

- [ ] **Step 4: Prisma Client 型再生成確認**

Run: `bun run type-check`
Expected: エラーなし（この時点ではまだ `reviewsEnabled` を参照していないため既存コードは影響なし）。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(space): add reviewsEnabled column for per-space review toggle"
```

---

## Task 2: ドメイン型・クエリに `reviewsEnabled` を反映（TDD）

**Files:**

- Modify: `src/shared/domain/spaces/queries.ts`
- Modify: `src/shared/domain/spaces/public-queries.ts`
- Modify: `src/shared/domain/spaces/commands.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts`
- Test: `__tests__/unit/domain/spaces/reviews-enabled.test.ts` (new)

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/domain/spaces/reviews-enabled.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import type { SpaceWithStats } from "@/admin/lib/validations/space";

describe("SpaceWithStats type includes reviewsEnabled", () => {
  it("reviewsEnabled is required boolean", () => {
    const sample: SpaceWithStats = {
      // ... 最小限必要なプロパティ ...
      id: "00000000-0000-0000-0000-000000000001",
      slug: "test",
      name: "Test",
      description: "desc",
      addressDetail: null,
      displayAddress: "東京都渋谷区",
      access: null,
      capacity: 10,
      area: null,
      hourlyPrice: 1000,
      dailyPrice: null,
      mainImageUrl: "https://example.com/image.jpg",
      imageUrls: [],
      facilities: [],
      businessHours: null,
      isPublished: true,
      publishedAt: null,
      isActive: true,
      reviewsEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      termsId: null,
      locationId: "00000000-0000-0000-0000-000000000002",
      categoryId: null,
      category: null,
      discountType: "none" as const,
      discountValue: null,
      durationDiscountOverride: "inherit" as const,
      taxRateType: "standard" as const,
      metaDescription: null,
      metaKeywords: null,
      ogpTitle: null,
      ogpDescription: null,
      ogpImageUrl: null,
      _count: { reservations: 0 },
    };
    expect(sample.reviewsEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: テスト実行（FAIL）**

Run: `bun test __tests__/unit/domain/spaces/reviews-enabled.test.ts`
Expected: FAIL — `Property 'reviewsEnabled' is missing in type 'SpaceWithStats'`

- [ ] **Step 3: `SpaceWithStats` 型に `reviewsEnabled` 追加**

`src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts` の `SpaceWithStats` の `isActive: boolean;` の直後に追加:

```typescript
isActive: boolean;
reviewsEnabled: boolean;
```

同ファイルの `defaultSpaceFormValues` に追加（`isPublished: false,` の直後）:

```typescript
isPublished: false,
reviewsEnabled: true,
```

同ファイルの `spaceFormSchema` の `.object({...})` 内に追加（`isPublished: z.boolean().default(false),` の直後）:

```typescript
isPublished: z.boolean().default(false),
reviewsEnabled: z.boolean().default(true),
```

- [ ] **Step 4: `queries.ts` の `formatSpaceToPlain` 入出力に `reviewsEnabled` 追加**

`src/shared/domain/spaces/queries.ts`:

入力型の `isActive: boolean;` の直後に:

```typescript
isActive: boolean;
reviewsEnabled: boolean;
```

戻り値の `isActive: s.isActive,` の直後に:

```typescript
isActive: s.isActive,
reviewsEnabled: s.reviewsEnabled,
```

同ファイル内の Prisma select（`spaceSelect` / `spaceListSelect` 等すべて）に `reviewsEnabled: true` を追加。`Grep` で `isActive: true,` を全検索し、各箇所の直後に `reviewsEnabled: true,` を追加する。

- [ ] **Step 5: `public-queries.ts` でも同様に追加**

`src/shared/domain/spaces/public-queries.ts` の全 `select` 句（`getSpaceBySlug` / `getPublishedSpacesPaginated` / `getRelatedSpaces` 等）に `reviewsEnabled: true,` を追加。戻り値型定義にも追加。

- [ ] **Step 6: `commands.ts` の create/update で `reviewsEnabled` を受け渡し**

`src/shared/domain/spaces/commands.ts` の `createSpaceCommand` / `updateSpaceCommand` の Prisma `data` に `reviewsEnabled: input.reviewsEnabled` を追加。

- [ ] **Step 7: テスト実行（PASS）**

Run: `bun test __tests__/unit/domain/spaces/reviews-enabled.test.ts`
Expected: PASS

- [ ] **Step 8: 全体型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 9: Commit**

```bash
git add src/ __tests__/
git commit -m "feat(space): propagate reviewsEnabled through domain layer"
```

---

## Task 3: 管理画面スペース編集フォームに「レビュー」トグル追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/publish-tab-panel.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/space-form-data-codec.ts`

- [ ] **Step 1: `spaceEditFormSchema` に `reviewsEnabled` を必須 boolean で追加**

`src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts` の `.extend({...})` 内、`isPublished: z.boolean(),` の直後:

```typescript
isPublished: z.boolean(),
reviewsEnabled: z.boolean(),
```

- [ ] **Step 2: `spaceEditFormDataToSpaceFormPayload` に `reviewsEnabled` を伝播**

同ファイルの `spaceEditFormDataToSpaceFormPayload` 戻り値オブジェクト、`isPublished: data.isPublished ?? false,` の直後:

```typescript
isPublished: data.isPublished ?? false,
reviewsEnabled: data.reviewsEnabled ?? true,
```

- [ ] **Step 3: `TAB_FIELDS.publish` に `reviewsEnabled` 追加**

同ファイルの `TAB_FIELDS.publish` 配列の先頭（`"isPublished",` の直後）に:

```typescript
publish: [
  "isPublished",
  "reviewsEnabled",
  "publishedAt",
  // ...
],
```

- [ ] **Step 4: 公開タブパネルにレビュー設定カード追加**

`src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/publish-tab-panel.tsx` の公開設定 Card の直後、SEO カードの前に以下を追加:

```tsx
<Card>
  <CardHeader>
    <CardTitle>レビュー設定</CardTitle>
  </CardHeader>
  <CardContent>
    <FormFieldWrapper
      control={control}
      name="reviewsEnabled"
      label="レビュー機能を有効化"
      description="オフにすると公開ページでレビューが非表示になり、顧客は新規投稿できなくなります。既存のレビューは削除されません。"
    >
      {(field) => (
        <Switch
          checked={field.value}
          onCheckedChange={(checked) => {
            setValue("reviewsEnabled", checked, { shouldDirty: true });
          }}
          disabled={isPending}
          aria-label="レビュー機能を有効化"
        />
      )}
    </FormFieldWrapper>
  </CardContent>
</Card>
```

import に `Switch` と既存の `FormFieldWrapper`（同ファイルで既に使われていなければ `@/admin/components/ui` から追加）を加える。既存の `SpaceEditBasicTabPanel` 等で使われているパターンをそのままコピーすること。

- [ ] **Step 5: `space-form-data-codec.ts` の FormData 往復で `reviewsEnabled` を扱う**

`src/app/(admin)/admin/(dashboard)/_shared/lib/space-form-data-codec.ts` を Read し、`isPublished` を `FormData.append("isPublished", ...)` / `formData.get("isPublished")` で扱っている箇所の直後に、同じパターンで `reviewsEnabled` を追加する:

```typescript
// encode
formData.append("reviewsEnabled", String(data.reviewsEnabled));

// decode（Zod パース前の中間オブジェクトに）
reviewsEnabled: formData.get("reviewsEnabled") === "true",
```

- [ ] **Step 6: Codec 単体テストが既にあれば `reviewsEnabled` のケースを追加**

Run:

```bash
bun test __tests__/unit/lib/space-form-data-codec.test.ts
```

既存テストの encode/decode ラウンドトリップ期待値に `reviewsEnabled: true` と `reviewsEnabled: false` の両パターンを追加（Read して既存テストを確認してから編集）。

- [ ] **Step 7: 型チェック + lint**

Run: `bun run validate`
Expected: エラーなし

- [ ] **Step 8: Commit**

```bash
git add src/ __tests__/
git commit -m "feat(space-edit-form): add reviewsEnabled toggle to publish tab"
```

---

## Task 4: nuqs パーサー統合（`rv*` プレフィックス追加 + 旧パーサー削除）

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts`
- Modify: `src/shared/lib/nuqs/index.ts`
- Modify: `src/shared/lib/constants/admin-space-management.ts`

- [ ] **Step 1: `ADMIN_SPACE_MANAGEMENT_TABS` に `reviews` 追加**

`src/shared/lib/constants/admin-space-management.ts`:

```typescript
export const ADMIN_SPACE_MANAGEMENT_TABS = [
  "spaces",
  "locations",
  "categories",
  "reviews",
] as const;
```

- [ ] **Step 2: `adminSpaceSearchParamsParsers` に `rv*` 追加**

`src/shared/lib/nuqs/parsers.ts` の `adminSpaceSearchParamsParsers` オブジェクトの末尾（`catPerPage: ...` の直後）に追加:

```typescript
  catPerPage: parseAsPerPage,
  // Reviews タブ
  rvSearch: parseAsQuery,
  rvRating: parseAsString.withDefault(""),
  rvPublished: parseAsString.withDefault(""),
  rvSpaceId: parseAsString.withDefault(""),
  rvPage: parseAsPage,
  rvPerPage: parseAsPerPage,
};
```

- [ ] **Step 3: 旧 `adminReviewSearchParamsParsers` 関連を完全削除**

同ファイルから以下のブロックを丸ごと削除（L509-531 付近）:

```typescript
// ============================================================
// 管理画面レビュー検索
// ============================================================

export const adminReviewSearchParamsParsers = { ... };
const adminReviewSearchParamsCache = createSearchParamsCache(...);
export async function loadAdminReviewSearchParams(...) { ... }
```

- [ ] **Step 4: `index.ts` から export を削除**

`src/shared/lib/nuqs/index.ts` の `adminReviewSearchParamsParsers` / `loadAdminReviewSearchParams` を含む export 行を削除。

- [ ] **Step 5: 参照箇所の残存チェック**

Run (via Grep tool):

```
pattern: adminReviewSearchParamsParsers|loadAdminReviewSearchParams
```

Expected: Task 5 以降で更新予定のファイル（`reviews/page.tsx` と `reviews/_components/ReviewFilters.tsx`）以外に残存なし。

- [ ] **Step 6: この時点ではまだ `bun run type-check` は通らない**（Task 5/6/7 完了まで保留）

- [ ] **Step 7: Commit（このタスクは Task 5-7 と不可分だが、論理単位として分離）**

```bash
git add src/shared/lib/nuqs/ src/shared/lib/constants/
git commit -m "refactor(nuqs): unify admin review filters into adminSpaceSearchParams (rv* prefix)"
```

---

## Task 5: `spaces/_components/` に Reviews タブコンポーネント群を新設

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTabContent.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewFilters.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTable.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewActionCell.tsx`

- [ ] **Step 1: `ReviewTable.tsx` を移設**

旧 `src/app/(admin)/admin/(dashboard)/reviews/_components/ReviewTable.tsx` の内容をそのままコピーし、`src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTable.tsx` として作成。import パス（`./ReviewActionCell` → `./ReviewActionCell`）はそのまま。

- [ ] **Step 2: `ReviewActionCell.tsx` を移設**

旧 `reviews/_components/ReviewActionCell.tsx` の内容を `spaces/_components/ReviewActionCell.tsx` にコピー。import は `@/admin/actions/review` のまま。

- [ ] **Step 3: `ReviewFilters.tsx` を新規作成（`rv*` パーサー使用）**

`src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewFilters.tsx`:

```tsx
"use client";

import { IconSearch } from "@tabler/icons-react";
import { useQueryStates } from "nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";
import { adminSpaceSearchParamsParsers } from "@/shared/lib/nuqs";

const PUBLISHED_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "true", label: "公開" },
  { value: "false", label: "非公開" },
];

const RATING_OPTIONS = [
  { value: "ALL", label: "すべての評価" },
  { value: "1", label: "★1" },
  { value: "2", label: "★2" },
  { value: "3", label: "★3" },
  { value: "4", label: "★4" },
  { value: "5", label: "★5" },
];

export function ReviewFilters() {
  const [params, setParams] = useQueryStates(adminSpaceSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handlePublishedChange = (value: string) => {
    void setParams({
      rvPublished: value === "ALL" ? null : value,
      rvPage: 1,
    });
  };

  const handleRatingChange = (value: string) => {
    void setParams({
      rvRating: value === "ALL" ? null : value,
      rvPage: 1,
    });
  };

  const handleSearchChange = (value: string) => {
    void setParams({
      rvSearch: value || null,
      rvPage: 1,
    });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="w-full sm:w-40">
        <Select
          value={params.rvPublished || "ALL"}
          onValueChange={handlePublishedChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="公開状態" />
          </SelectTrigger>
          <SelectContent>
            {PUBLISHED_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-40">
        <Select
          value={params.rvRating || "ALL"}
          onValueChange={handleRatingChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="評価" />
          </SelectTrigger>
          <SelectContent>
            {RATING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative flex-1">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="スペース名、顧客名で検索..."
          defaultValue={params.rvSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `ReviewTabContent.tsx` を新規作成（Server Component + Suspense + パーサーキャッシュから read）**

`src/app/(admin)/admin/(dashboard)/spaces/_components/ReviewTabContent.tsx`:

```tsx
import { Suspense } from "react";
import { connection } from "next/server";
import { getReviews } from "@/admin/queries/review";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { ReviewFilters } from "./ReviewFilters";
import { ReviewTable } from "./ReviewTable";

async function ReviewList() {
  await connection();

  const rvSearch = adminSpaceSearchParamsCache.get("rvSearch");
  const rvRating = adminSpaceSearchParamsCache.get("rvRating");
  const rvPublished = adminSpaceSearchParamsCache.get("rvPublished");
  const rvSpaceId = adminSpaceSearchParamsCache.get("rvSpaceId");
  const rvPage = adminSpaceSearchParamsCache.get("rvPage");
  const rvPerPage = adminSpaceSearchParamsCache.get("rvPerPage");

  const ratingNum = rvRating ? Number(rvRating) : undefined;
  const isPublished =
    rvPublished === "true"
      ? true
      : rvPublished === "false"
        ? false
        : ("ALL" as const);

  const filters: {
    search?: string;
    spaceId?: string;
    rating?: number;
    isPublished: boolean | "ALL";
  } = { isPublished };

  if (rvSearch) filters.search = rvSearch;
  if (rvSpaceId) filters.spaceId = rvSpaceId;
  if (ratingNum !== undefined) filters.rating = ratingNum;

  const result = await getReviews(filters, {
    page: rvPage,
    limit: rvPerPage,
  });

  return (
    <>
      <ReviewTable reviews={result.reviews} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

export function ReviewTabContent() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <ReviewFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <ReviewList />
      </Suspense>
    </div>
  );
}
```

**重要**: `adminSpaceSearchParamsCache.get()` を使うため、親ページ（`spaces/page.tsx`）で `.parse()` が先に呼ばれている必要がある（既存実装で呼ばれている）。

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: 新規ファイル群はエラーなし。旧 `reviews/` 配下のファイルは Task 7 で削除するため、この時点ではまだ型エラーが出る可能性あり（Task 6-7 で解消）。

- [ ] **Step 6: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/spaces/_components/Review*.tsx
git commit -m "feat(admin-spaces): add reviews tab components (ReviewTabContent/Filters/Table/ActionCell)"
```

---

## Task 6: `SpaceManagementTabs` と `spaces/page.tsx` を reviews タブ対応

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceManagementTabs.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/page.tsx`

- [ ] **Step 1: `SpaceManagementTabs.tsx` の `TAB_ITEMS` に reviews 追加**

```typescript
const TAB_ITEMS: { value: AdminSpaceManagementTab; label: string }[] = [
  { value: "spaces", label: "スペース" },
  { value: "locations", label: "場所" },
  { value: "categories", label: "カテゴリー" },
  { value: "reviews", label: "レビュー" },
];
```

- [ ] **Step 2: 右端の「新規作成」ボタンは reviews タブで非表示（既存パターン踏襲）**

同ファイルの既存の条件付きレンダリング部分:

```tsx
{
  activeTab === "spaces" && (
    <Button asChild>
      <Link href="/admin/spaces/new">新規作成</Link>
    </Button>
  );
}
{
  activeTab === "locations" && (
    <Button asChild>
      <Link href="/admin/locations/new">新規作成</Link>
    </Button>
  );
}
{
  activeTab === "categories" && <CreateCategoryDialog />;
}
{
  /* reviews タブはユーザー投稿のため新規作成ボタンなし */
}
```

`reviews` の分岐は追加不要（既存 3 条件のみで OK）。

- [ ] **Step 3: `spaces/page.tsx` の `tabPanel()` に reviews ケース追加**

```tsx
import { ReviewTabContent } from "./_components/ReviewTabContent";

function tabPanel(tab: AdminSpaceManagementTab) {
  switch (tab) {
    case "spaces":
      return <SpaceTabContent />;
    case "locations":
      return <LocationTabContent />;
    case "categories":
      return <CategoryTabContent />;
    case "reviews":
      return <ReviewTabContent />;
  }
}
```

- [ ] **Step 4: ヘッダー説明文を更新**

```tsx
<p className="text-sm text-muted-foreground sm:text-base">
  スペース・場所・カテゴリー・レビューを一元管理します
</p>
```

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: `spaces/` 配下は全て解決。`reviews/` 配下はまだ残っているため、そちらの古い import 由来のエラーが残る可能性あり（Task 7 で解消）。

- [ ] **Step 6: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/spaces/
git commit -m "feat(admin-spaces): wire reviews tab into SpaceManagementTabs hub"
```

---

## Task 7: 旧 `/admin/reviews` ルート完全削除

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/reviews/` ディレクトリ全体

- [ ] **Step 1: ルート配下の git 管理ファイルを削除**

Run:

```bash
git rm -r "src/app/(admin)/admin/(dashboard)/reviews"
```

Expected: `page.tsx`, `loading.tsx`, `error.tsx`, `_components/ReviewTable.tsx`, `_components/ReviewFilters.tsx`, `_components/ReviewActionCell.tsx` が削除対象。

- [ ] **Step 2: 参照残存チェック**

Grep tool で以下を検索し、残存がないことを確認:

- pattern: `/admin/reviews`
- pattern: `from.*reviews/_components`
- pattern: `loadAdminReviewSearchParams`
- pattern: `adminReviewSearchParamsParsers`

Expected: テストファイル以外ではヒットなし。ヒットした場合は Task 8-9 の対象として更新する。

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: エラーなし（あれば Task 8 の対象ファイルを先に処理）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(admin): delete /admin/reviews route (merged into /admin/spaces?tab=reviews)"
```

---

## Task 8: 通知ヘルパー・サイドバー・データマイグレーションで URL を一括置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/notification-helpers.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`
- Create: `prisma/migrations/YYYYMMDDHHMMSS_rewrite_review_notification_links/migration.sql`

- [ ] **Step 1: `notification-helpers.ts` を更新**

```typescript
export function getNotificationResourceHref(
  resourceType: string | null,
  resourceId: string | null,
): string | null {
  if (!resourceType || !resourceId) return null;
  const routes: Record<string, string> = {
    reservation: `/admin/reservations/${resourceId}`,
    inquiry: `/admin/inquiries/${resourceId}`,
    review: `/admin/spaces?tab=reviews`,
    event: `/admin/events/${resourceId}/edit`,
  };
  return routes[resourceType] ?? null;
}
```

- [ ] **Step 2: `sidebar-items.tsx` のレビュー項目を更新**

`src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` の L93-94 を:

```typescript
{
  label: "レビュー",
  href: "/admin/spaces?tab=reviews",
  // ... 他の既存プロパティ（icon 等）はそのまま ...
}
```

**判断**: サイドバーの独立項目は**残す**（頻繁なモデレーション動線を維持）。タブに `?tab=reviews` で直行する。

- [ ] **Step 3: データマイグレーション SQL を作成**

既存の `AdminNotification` レコードのうち `linkUrl = '/admin/reviews'` のものを書き換える。

`prisma migrate diff` では DML を生成できないため、手書きで migration ファイルを作成:

```bash
mkdir -p "prisma/migrations/20260413120000_rewrite_review_notification_links"
```

`prisma/migrations/20260413120000_rewrite_review_notification_links/migration.sql`:

```sql
-- Rewrite legacy /admin/reviews links to the new hub tab URL
UPDATE "admin_notifications"
SET "link_url" = '/admin/spaces?tab=reviews'
WHERE "link_url" = '/admin/reviews';
```

**注意**: テーブル名・カラム名は `prisma/schema.prisma` の `AdminNotification` モデルの `@@map` / `@map` を確認して合わせる。異なる場合は schema から取得した実名を使用。

- [ ] **Step 4: マイグレーション適用**

Run:

```bash
bunx --bun prisma migrate dev
```

Expected: データマイグレーションが適用され、Prisma が `_prisma_migrations` に記録。

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/ prisma/migrations/
git commit -m "refactor(notifications): repoint review links to /admin/spaces?tab=reviews + backfill existing rows"
```

---

## Task 9: 公開側ページで `reviewsEnabled` ガードを実装（一覧 + 詳細）

**Files:**

- Modify: `src/app/(public)/spaces/[slug]/page.tsx`
- Modify: `src/app/(public)/spaces/[slug]/_components/space-reviews.tsx`
- Modify: `src/app/(public)/spaces/page.tsx`
- Modify: `src/shared/domain/reviews/public-queries.ts`

- [ ] **Step 1: `public-queries.ts` の where に `space: { reviewsEnabled: true }` を追加**

`src/shared/domain/reviews/public-queries.ts`:

- `getPublishedReviewsForSpace`:

  ```typescript
  where: {
    spaceId,
    isPublished: true,
    space: { reviewsEnabled: true },
  },
  ```

- `getSpaceReviewStats` の `aggregate`:

  ```typescript
  where: {
    spaceId,
    isPublished: true,
    space: { reviewsEnabled: true },
  },
  ```

- `getSpaceReviewStatsMultiple` の `groupBy`:

  ```typescript
  where: {
    spaceId: { in: spaceIds },
    isPublished: true,
    space: { reviewsEnabled: true },
  },
  ```

- [ ] **Step 2: `spaces/[slug]/page.tsx` で `reviewsEnabled` 分岐**

```tsx
const reviewStats = space.reviewsEnabled
  ? await getSpaceReviewStats(space.id)
  : { averageRating: 0, totalCount: 0 };
```

同ファイルの `<Suspense fallback={null}><SpaceReviews spaceId={space.id} /></Suspense>` を:

```tsx
{
  space.reviewsEnabled && (
    <Suspense fallback={null}>
      <SpaceReviews spaceId={space.id} />
    </Suspense>
  );
}
```

`ProductJsonLd` の `aggregateRating` は既に `reviewStats.totalCount > 0` でガード済みなので、`reviewsEnabled=false` の場合 `totalCount=0` のため自動的に出力されない（追加変更不要）。

- [ ] **Step 3: `spaces/page.tsx` で `reviewsEnabled` ガード**

一覧カードのレビュー件数バッジは `SpaceGrid` に `reviewStats` 経由で渡している。`getSpaceReviewStatsMultiple` は Step 1 で `reviewsEnabled=true` のみ返すよう変更済みなので、`reviewsEnabled=false` のスペースは stats Record に含まれず、カード側は既存の「stats がない場合の fallback（0件 or バッジ非表示）」で自然に処理される。

`spaces/page.tsx` は変更不要（Step 1 の DB 側変更で全て解決）。ただし `SpaceGrid` / `SpaceCard` が stats 欠落時に正しくバッジを非表示にしているか Read して確認し、していなければそちらを修正。

- [ ] **Step 4: 型チェック + lint**

Run: `bun run validate`
Expected: エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(public-spaces): gate review display via Space.reviewsEnabled"
```

---

## Task 10: マイページ投稿フォーム + ドメインコマンドで投稿ガード

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/page.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/_components/review-form.tsx`
- Modify: `src/shared/domain/reviews/commands.ts`

- [ ] **Step 1: `createReviewCommand` でサーバー側ガード**

`src/shared/domain/reviews/commands.ts` の `createReviewCommand` の `reservation` 取得 select に `space` を追加:

```typescript
const reservation = await prisma.reservation.findUnique({
  where: { id: input.reservationId, deletedAt: null },
  select: {
    id: true,
    customerId: true,
    spaceId: true,
    status: true,
    space: { select: { reviewsEnabled: true } },
    review: { select: { id: true } },
  },
});
```

そして `reservation.review` チェックの直前に追加:

```typescript
if (!reservation.space.reviewsEnabled) {
  throw new DomainError(
    "このスペースではレビュー投稿が無効化されています",
    "VALIDATION",
  );
}

if (reservation.review) {
  throw new DomainError(
    "この予約には既にレビューが投稿されています",
    "CONFLICT",
  );
}
```

- [ ] **Step 2: マイページ予約詳細で `reviewsEnabled` を渡す**

`src/app/(public)/mypage/reservations/[id]/page.tsx` の予約取得クエリの select に `space.reviewsEnabled` を追加（既存 select を Read してから該当箇所を特定）。`<ReviewForm />` に `reviewsEnabled={reservation.space.reviewsEnabled}` を prop として渡す。

- [ ] **Step 3: `review-form.tsx` で無効化メッセージ表示**

```tsx
type ReviewFormProps = {
  reservationId: string;
  reviewsEnabled: boolean;
  // ... 既存 props ...
};

export function ReviewForm({ reservationId, reviewsEnabled, ... }: ReviewFormProps) {
  if (!reviewsEnabled) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">
          このスペースはレビュー投稿を受け付けていません。
        </p>
      </div>
    );
  }
  // ... 既存のフォーム描画 ...
}
```

- [ ] **Step 4: ドメインコマンドのテスト追加**

`__tests__/unit/domain/reviews/commands.test.ts` を Read し、`createReviewCommand` の既存テスト群の直後に追加:

```typescript
describe("createReviewCommand with reviewsEnabled=false", () => {
  it("throws DomainError when space has reviewsEnabled=false", async () => {
    // mock prisma.reservation.findUnique to return space: { reviewsEnabled: false }
    // expect(createReviewCommand(...)).rejects.toThrow(DomainError)
    // expect error message: "このスペースではレビュー投稿が無効化されています"
  });
});
```

既存テストの mock パターンに合わせて記述。

- [ ] **Step 5: テスト実行**

Run: `bun test __tests__/unit/domain/reviews/commands.test.ts`
Expected: PASS（新規追加分含む）

- [ ] **Step 6: 型チェック + lint**

Run: `bun run validate`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add src/ __tests__/
git commit -m "feat(reviews): block submission when Space.reviewsEnabled is false (domain + UI)"
```

---

## Task 11: 最終検証とスモークテスト

**Files:**

- 実行: `bun run validate`
- 実行: `bun run build`
- 実行: dev サーバー + 手動ブラウザ確認（または Playwright MCP）

- [ ] **Step 1: 全体 validate**

Run: `bun run validate && bun run build`
Expected: エラーなし。ビルド成功。

- [ ] **Step 2: dev サーバー起動**

Run: `bun dev` (run_in_background: true)

- [ ] **Step 3: 破壊的変更の確認 — `/admin/reviews` が 404 を返す**

ブラウザまたは curl で `http://localhost:3000/admin/reviews` にアクセス。
Expected: 404 Not Found（redirect ではなく完全削除）

- [ ] **Step 4: `/admin/spaces?tab=reviews` で新しいレビュータブが表示される**

Expected:

- ページ見出し「スペース管理」
- タブに「スペース / 場所 / カテゴリー / レビュー」が並び、`reviews` がアクティブ
- 右端の新規作成ボタン非表示
- フィルタ（公開状態 / 評価 / 検索）と既存レビュー一覧テーブルが描画
- URL クエリが `tab=reviews&rvSearch=...&rvPage=1` の形式

- [ ] **Step 5: フィルタが他タブに影響しないことを確認**

reviews タブで検索入力後、タブを「スペース」に切り替え → `spSearch` が空のままであること。戻ると `rvSearch` が保持されていること。

- [ ] **Step 6: スペース編集 → レビュー OFF → 公開ページで非表示確認**

1. `/admin/spaces/{id}/edit` → 公開・SEO タブ → 「レビュー機能を有効化」OFF → 保存
2. `/spaces/{slug}` → `<SpaceReviews />` が描画されていないこと、`aggregateRating` の JSON-LD も出力されないこと
3. `/mypage/reservations/{completedReservationId}` → レビュー投稿フォームではなく「このスペースはレビュー投稿を受け付けていません。」が表示されること
4. レビュー OFF 状態で DevTools から Server Action を強制実行 → `DomainError` で拒否されること（または開発者が cURL で確認）

- [ ] **Step 7: サイドバー「レビュー」クリック → `/admin/spaces?tab=reviews` に遷移**

Expected: 正しい URL に遷移し、reviews タブがアクティブになる。

- [ ] **Step 8: 通知リンクが新 URL を指すことを確認（既存通知 DB レコード）**

Run:

```bash
bun -e "const { PrismaClient } = require('./generated/prisma/client'); const { PrismaPg } = require('@prisma/adapter-pg'); const pg = new PrismaPg({ connectionString: process.env.DATABASE_URL }); const p = new PrismaClient({ adapter: pg }); p.adminNotification.findMany({ where: { resourceType: 'review' }, select: { id: true, linkUrl: true }, take: 5 }).then(r => { console.log(JSON.stringify(r, null, 2)); p.\$disconnect(); })"
```

Expected: `linkUrl` が全て `/admin/spaces?tab=reviews` になっていること。`/admin/reviews` のレコードは 0 件。

- [ ] **Step 9: 全テストスイート実行**

Run: `bun run test`
Expected: PASS（既存テストも含めて）。`__tests__/integration/actions/admin/space.test.ts` の既存テストがあれば `reviewsEnabled` 追加の影響を確認。

- [ ] **Step 10: dev サーバー停止 + final commit（必要なら修正コミット）**

```bash
# fix-up commits があれば:
git add -A
git commit -m "fix(reviews-integration): address validation findings"
```

- [ ] **Step 11: CHANGELOG 記述（任意だが推奨）**

`docs/plans/2026-04-13-reviews-space-integration.md` の末尾に「実装結果」セクションを追記:

- 実装した PR / コミット範囲
- 破壊的変更の影響範囲
- 今後のマイグレーション手順（本番デプロイ時の注意）

---

## 破壊的変更サマリー（本番デプロイ前に必読）

1. **URL 削除**: `/admin/reviews` はデプロイ直後から 404。ブックマーク・外部リンク（内部のみ想定）を事前告知。
2. **DB マイグレーション必須**:
   - `spaces.reviews_enabled` カラム追加（default true のためダウンタイムなし）
   - `admin_notifications.link_url` の backfill（リンク書き換え）
3. **Cloud Run デプロイ順序**: マイグレーションを先行実行 → 新コードをデプロイ（逆順だと新コードが存在しないカラムを参照する）
4. **ロールバック困難**: `rv*` パーサー統合と `/admin/reviews` 削除を戻すにはコードリバート + マイグレーションロールバックが必要。段階ロールバック不可。

---

## 自己レビューチェックリスト

- [x] Task 1: DB マイグレーション（reviewsEnabled 追加）
- [x] Task 2: ドメイン型・クエリ層への伝播
- [x] Task 3: スペース編集フォームへのトグル追加
- [x] Task 4: nuqs パーサー統合（`rv*` プレフィックス）
- [x] Task 5: Reviews タブコンポーネント群の新設
- [x] Task 6: スペース管理ハブへのタブ組み込み
- [x] Task 7: `/admin/reviews` ルート削除
- [x] Task 8: 通知ヘルパー + サイドバー + データマイグレーション
- [x] Task 9: 公開ページ側の `reviewsEnabled` ガード
- [x] Task 10: マイページ + ドメインコマンドの投稿ガード
- [x] Task 11: 最終検証

全要件カバー済み。プレースホルダなし。型・メソッド名の一貫性 OK（`reviewsEnabled` / `rv*` / `adminSpaceSearchParamsParsers`）。
