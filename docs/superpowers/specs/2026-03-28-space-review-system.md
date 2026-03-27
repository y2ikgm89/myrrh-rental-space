# スペースレビュー/評価システム — 設計スペック

## 概要

レンタルスペース予約システムに顧客レビュー機能を追加。予約完了（COMPLETED）後にマイページからスペースへの評価・コメントを投稿できる。スペース一覧・詳細ページに平均評価を表示し、管理画面でモデレーションを行う。

## 投稿条件

- **予約ステータスが COMPLETED** の予約を持つ顧客のみ投稿可能
- **1予約につき1レビュー**（`reservationId` に UNIQUE 制約）
- 投稿後の編集・削除は不可（管理者による非表示のみ）

## データモデル

```prisma
model SpaceReview {
  id            String   @id @default(uuid()) @db.Uuid
  spaceId       String   @db.Uuid
  customerId    String   @db.Uuid
  reservationId String   @unique @db.Uuid
  rating        Int      // 1-5
  title         String?  @db.VarChar(100)
  comment       String?  @db.VarChar(1000)
  isPublished   Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  space       Space       @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  customer    Customer    @relation(fields: [customerId], references: [id], onDelete: Cascade)
  reservation Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)

  @@index([spaceId, isPublished, createdAt(sort: Desc)])
  @@index([customerId])
  @@map("space_reviews")
}
```

**リレーション追加**:

- `Space`: `reviews SpaceReview[]`
- `Customer`: `reviews SpaceReview[]`
- `Reservation`: `review SpaceReview?`（1:1）

## Zod スキーマ

```typescript
// src/shared/lib/validations/review.ts
export const spaceReviewSchema = z.object({
  reservationId: z.string().uuid({ error: "予約IDが不正です" }),
  rating: z
    .number()
    .int()
    .min(1, { error: "1以上を選択してください" })
    .max(5, { error: "5以下を選択してください" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内" })
    .optional()
    .or(z.literal("")),
  comment: z
    .string()
    .max(1000, { error: "コメントは1000文字以内" })
    .optional()
    .or(z.literal("")),
});
```

## キャッシュ戦略

| タグ                                 | 用途               | ライフ           |
| ------------------------------------ | ------------------ | ---------------- |
| `CACHE_TAGS.REVIEWS`                 | レビュー一覧       | `PUBLIC_CONTENT` |
| `getCacheTag.reviews.space(spaceId)` | スペース別レビュー | `PUBLIC_CONTENT` |
| `getCacheTag.reviews.stats(spaceId)` | 平均評価・件数     | `PUBLIC_CONTENT` |

**無効化**: レビュー作成・非表示トグル時に `updateTag(CACHE_TAGS.REVIEWS)` + `updateTag(getCacheTag.reviews.space(spaceId))` + `updateTag(getCacheTag.reviews.stats(spaceId))`

## ドメイン層

### `src/shared/domain/reviews/commands.ts`

- `createReviewCommand(data)` — 予約の所有者チェック + COMPLETED チェック + 重複チェック + insert

### `src/shared/domain/reviews/queries.ts`

- `getReviewsForAdmin(filters, pagination)` — 管理画面一覧（全レビュー、フィルタ付き）

### `src/shared/domain/reviews/public-queries.ts`

- `getPublishedReviewsForSpace(spaceId, limit)` — 公開レビュー一覧（`'use cache'`）
- `getSpaceReviewStats(spaceId)` — `{ averageRating, totalCount }`（`'use cache'`）
- `getSpaceReviewStatsMultiple(spaceIds)` — スペース一覧用バッチ取得（`'use cache'`）
- `getCustomerReviewForReservation(customerId, reservationId)` — 既投稿チェック

## Server Actions

### 公開（`src/app/(public)/_shared/actions/review.ts`）

```typescript
export async function submitReview(
  input: SpaceReviewInput,
): Promise<MutationResult<{ id: string }>>;
```

- `getSession()` → `getCustomerByUserId()` → 予約所有者チェック → COMPLETED チェック → 重複チェック → `createReviewCommand`
- キャッシュ無効化: REVIEWS + space detail + stats

### 管理（`src/app/(admin)/.../_shared/actions/review.ts`）

```typescript
export async function toggleReviewVisibility(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<null>>;
```

- `executeAdminMutationResult` パターン

## 公開ページ UI

### スペース一覧カード（`space-card.tsx` 修正）

```
★ 4.2 (15件)
```

- `getSpaceReviewStatsMultiple()` で一括取得
- レビュー0件の場合は非表示

### スペース詳細（`spaces/[slug]/page.tsx` に追加）

- セクション「レビュー」: 平均評価バー + 最新5件
- 各レビュー: 星 + タイトル + コメント + 投稿日 + 顧客名（姓のみ + イニシャル）
- 「もっと見る」→ 全件表示（ページネーションなし、max 50件）

### マイページ予約詳細（`mypage/reservations/[id]/page.tsx` 修正）

- COMPLETED かつ未レビュー → 「レビューを書く」ボタン表示
- レビュー投稿フォーム: 星選択 + タイトル(任意) + コメント(任意)
- 投稿済み → 自分のレビューを表示（編集不可）

### 星評価コンポーネント（`_shared/components/ui/star-rating.tsx`）

- `readonly` モード: 表示のみ（スペース一覧・詳細）
- `interactive` モード: クリック/タップで選択（レビューフォーム）
- Lucide `Star` アイコン使用（filled + outlined）
- `aria-label` 付き

## 管理画面 UI

### レビュー一覧ページ（`admin/reviews/page.tsx`）

- テーブル: スペース名、顧客名、星評価、タイトル、投稿日、公開/非公開
- フィルタ: スペース、星評価、公開状態
- ActionDropdown: 詳細表示、非表示トグル
- サイドバーに「レビュー」メニュー追加

## ファイル構成

### 新規作成

| ファイル                                                                     | 責務                    |
| ---------------------------------------------------------------------------- | ----------------------- |
| `prisma/migrations/XXXXXX_add_space_reviews/`                                | マイグレーション        |
| `src/shared/lib/validations/review.ts`                                       | Zod スキーマ            |
| `src/shared/domain/reviews/commands.ts`                                      | 作成コマンド            |
| `src/shared/domain/reviews/queries.ts`                                       | 管理クエリ              |
| `src/shared/domain/reviews/public-queries.ts`                                | 公開クエリ（cache付き） |
| `src/app/(public)/_shared/actions/review.ts`                                 | 公開 Server Action      |
| `src/app/(public)/_shared/components/ui/star-rating.tsx`                     | 星評価コンポーネント    |
| `src/app/(public)/mypage/reservations/[id]/_components/review-form.tsx`      | レビュー投稿フォーム    |
| `src/app/(public)/mypage/reservations/[id]/_components/review-display.tsx`   | 投稿済みレビュー表示    |
| `src/app/(public)/spaces/[slug]/_components/space-reviews.tsx`               | レビューセクション      |
| `src/app/(admin)/admin/(dashboard)/reviews/page.tsx`                         | 管理一覧                |
| `src/app/(admin)/admin/(dashboard)/reviews/loading.tsx`                      | ローディング            |
| `src/app/(admin)/admin/(dashboard)/reviews/_components/ReviewTable.tsx`      | テーブル                |
| `src/app/(admin)/admin/(dashboard)/reviews/_components/ReviewActionCell.tsx` | 操作メニュー            |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/review.ts`                | 管理 Server Action      |
| `src/app/(admin)/admin/(dashboard)/_shared/queries/review.ts`                | 管理クエリ              |

### 修正

| ファイル                                                          | 変更内容                                |
| ----------------------------------------------------------------- | --------------------------------------- |
| `prisma/schema.prisma`                                            | SpaceReview モデル + リレーション追加   |
| `src/shared/lib/constants/cache.ts`                               | REVIEWS タグ + getCacheTag.reviews 追加 |
| `src/shared/lib/validations/enums/guards.ts`                      | レビュー用ガード不要（enum なし）       |
| `src/app/(public)/spaces/[slug]/page.tsx`                         | レビューセクション追加                  |
| `src/app/(public)/spaces/_components/space-card.tsx`              | 平均評価バッジ追加                      |
| `src/app/(public)/mypage/reservations/[id]/page.tsx`              | レビューフォーム/表示追加               |
| `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` | レビューメニュー追加                    |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`    | review リソース追加                     |

## セキュリティ

- レビュー投稿: `getSession()` → `getCustomerByUserId()` → 予約所有者チェック（他人の予約にレビュー不可）
- 管理操作: `executeAdminMutationResult` + `resource: "review"` 権限
- XSS: テキストはプレーンテキスト表示（HTML 不可）
- レート制限: `formSubmitRateLimiter`（公開フォームと同じ 5/min）

## テスト

- Unit: `__tests__/unit/shared/lib/validations/review.test.ts` — Zod スキーマ
- Integration: `__tests__/integration/actions/admin/review.test.ts` — 管理アクション
- Integration: `__tests__/integration/actions/public/review.test.ts` — 公開アクション（所有者チェック等）
