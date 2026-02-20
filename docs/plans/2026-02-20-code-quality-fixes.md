# コード品質修正 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** コードレビュー指摘の4問題（エラーハンドリング欠如 / useContext→use() / Date 型境界 / Tailwind ハードコードカラー）を公式ベストプラクティス準拠のクリーンな実装で修正する。

**Architecture:** 後方互換性ハックなし。各修正は独立したタスクとして実施。coupon.ts は `ActionResult` 型へ移行、Context API は React 19 の `use()` フックに統一、Date 型は `string | null` に統一、Tailwind はセマンティックトークンに置換。

**Tech Stack:** Next.js 16, React 19, TypeScript 6.0-beta, Zod 4, Prisma 7, Tailwind CSS 4, Bun

**Design Doc:** `docs/plans/2026-02-20-code-quality-fixes-design.md`

---

## Task 1: coupon.ts — ActionResult 移行 + エラーハンドリング追加

**Files:**

- Modify: `src/shared/actions/coupon.ts`

### Step 1: ファイルを読む

`src/shared/actions/coupon.ts` を全文読む。

### Step 2: coupon.ts を書き換える

以下の変更を適用:

1. `import 'server-only'` を先頭に追加
2. `CouponValidationResult` 型を削除
3. 新しい import を追加:
   ```typescript
   import {
     createSuccess,
     createFailure,
     type ActionResult,
   } from "@/shared/types/server-actions";
   import { logError, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
   ```
4. `validateCouponCode` の戻り値型を `Promise<ActionResult<{ coupon: ValidatedCoupon }>>` に変更
5. 関数本体を try/catch でラップ:

```typescript
export async function validateCouponCode(
  code: string,
  reservationAmount?: number,
): Promise<ActionResult<{ coupon: ValidatedCoupon }>> {
  const normalizedCode = code.toUpperCase().trim();

  if (normalizedCode.length < 4) {
    return createFailure("クーポンコードは4文字以上で入力してください");
  }

  if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
    return createFailure("無効なクーポンコードです");
  }

  try {
    const coupon = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    const now = new Date();
    let isInvalid = false;
    let minAmountError: string | null = null;

    if (!coupon || !coupon.isActive) {
      isInvalid = true;
    }

    if (coupon) {
      if (coupon.validFrom > now) {
        isInvalid = true;
      }
      if (coupon.validUntil && coupon.validUntil < now) {
        isInvalid = true;
      }
      if (
        coupon.usageLimit !== null &&
        coupon.usageCount >= coupon.usageLimit
      ) {
        isInvalid = true;
      }
      if (reservationAmount !== undefined && coupon.minReservationAmount) {
        if (reservationAmount < coupon.minReservationAmount) {
          minAmountError = `このクーポンは¥${coupon.minReservationAmount.toLocaleString()}以上のご利用で適用できます`;
        }
      }
    }

    if (isInvalid || !coupon) {
      return createFailure("無効なクーポンコードです");
    }

    if (minAmountError) {
      return createFailure(minAmountError);
    }

    return createSuccess("クーポンを適用しました", {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        discountValue: coupon.discountValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
      },
    });
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "validateCouponCode", code: normalizedCode },
    });
    return createFailure("一時的なエラーが発生しました");
  }
}
```

6. `incrementCouponUsage` を try/catch でラップ:

```typescript
export async function incrementCouponUsage(couponId: string): Promise<void> {
  try {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usageCount: { increment: 1 } },
    });
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "incrementCouponUsage", couponId },
    });
    throw error;
  }
}
```

7. `decrementCouponUsage` を try/catch でラップ:

```typescript
export async function decrementCouponUsage(couponId: string): Promise<void> {
  try {
    await prisma.coupon.updateMany({
      where: { id: couponId, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "decrementCouponUsage", couponId },
    });
    throw error;
  }
}
```

### Step 3: admin.ts の型アノテーションを更新

`src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts` を読む。

`CouponValidationResult` の import が残っていないか確認。残っていれば削除する（実コードロジックの変更は不要。型は `ActionResult<{ coupon: ValidatedCoupon }>` が自動推論される）。

具体的に確認すること:

- `couponResult.success` → OK（ActionResult にも `.success` あり）
- `couponResult.error` → OK（ActionFailure にも `.error` あり）
- `couponResult.data?.coupon` → OK（ActionSuccess<{coupon:...}> にも `.data.coupon` あり）

### Step 4: 型チェック

```bash
bun run type-check
```

Expected: エラーなし

### Step 5: Commit

```bash
git add src/shared/actions/coupon.ts
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts'
git commit -m "fix(coupon): migrate to ActionResult and add error handling with logError"
```

---

## Task 2: Context API — useContext → use() 移行（5ファイル）

**Files:**

- Modify: `src/shared/contexts/aria-live-context.tsx`
- Modify: `src/app/(public)/_shared/components/effects/core/VisualEffectsProvider.tsx`
- Modify: `src/app/(public)/_shared/components/effects/three/ThreeCanvas.tsx`
- Modify: `src/app/(public)/_shared/components/effects/core/ScrollOrchestrator.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/contexts/confirm-context.tsx`

### Step 1: aria-live-context.tsx を修正

ファイルを読み、以下を適用:

```diff
- import {
-   createContext,
-   useContext,
-   useState,
+ import {
+   createContext,
+   use,
+   useState,
```

`useAriaLive` 関数:

```diff
- const context = useContext(AriaLiveContext)
- if (!context) {
+ const context = use(AriaLiveContext)
+ if (context === undefined) {
```

`useAriaLiveOptional` 関数:

```diff
- return useContext(AriaLiveContext) ?? null
+ return use(AriaLiveContext) ?? null
```

### Step 2: VisualEffectsProvider.tsx を修正

ファイルを読み、以下を適用:

```diff
- import { createContext, useContext, useEffect, useState } from 'react'
+ import { createContext, use, useEffect, useState } from 'react'
```

`useVisualEffects` 関数:

```diff
- const ctx = useContext(VisualEffectsContext)
+ const ctx = use(VisualEffectsContext)
  if (ctx === undefined) {
```

`useVisualEffectsOptional` 関数:

```diff
- return useContext(VisualEffectsContext) ?? null
+ return use(VisualEffectsContext) ?? null
```

### Step 3: ThreeCanvas.tsx を修正

ファイルを読み、以下を適用:

```diff
- import { useRef, useEffect, useState, createContext, useContext } from 'react'
+ import { useRef, useEffect, useState, createContext, use } from 'react'
```

ScrollRefContext の定義:

```diff
- const ScrollRefContext = createContext<RefObject<ScrollState> | null>(null)
+ const ScrollRefContext = createContext<RefObject<ScrollState> | undefined>(undefined)
```

`useScrollRef` 関数:

```diff
- const ref = useContext(ScrollRefContext)
- if (!ref) {
+ const ref = use(ScrollRefContext)
+ if (ref === undefined) {
```

### Step 4: ScrollOrchestrator.tsx を修正

ファイルを読み、以下を適用:

```diff
- import { createContext, useContext, useState } from 'react'
+ import { createContext, use, useState } from 'react'
```

`useScrollState` 関数:

```diff
- const state = useContext(ScrollStateContext)
+ const state = use(ScrollStateContext)
  if (state === undefined) {
```

### Step 5: confirm-context.tsx を修正

ファイルを読み、以下を適用:

```diff
- import {
-   createContext,
-   useContext,
-   useState,
+ import {
+   createContext,
+   use,
+   useState,
```

`ConfirmContext` の定義:

```diff
- const ConfirmContext = createContext<ConfirmContextValue | null>(null)
+ const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined)
```

`useConfirm` 関数:

```diff
- const context = useContext(ConfirmContext)
- if (!context) {
+ const context = use(ConfirmContext)
+ if (context === undefined) {
```

### Step 6: 型チェック

```bash
bun run type-check
```

Expected: エラーなし

### Step 7: Commit

```bash
git add src/shared/contexts/aria-live-context.tsx
git add 'src/app/(public)/_shared/components/effects/core/VisualEffectsProvider.tsx'
git add 'src/app/(public)/_shared/components/effects/three/ThreeCanvas.tsx'
git add 'src/app/(public)/_shared/components/effects/core/ScrollOrchestrator.tsx'
git add 'src/app/(admin)/admin/(dashboard)/_shared/contexts/confirm-context.tsx'
git commit -m "fix(react): migrate useContext to use() per React 19 best practices"
```

---

## Task 3: Date 型 — string | null に統一（3ファイル）

**Files:**

- Modify: `src/app/(public)/_components/PostListSection.tsx`
- Modify: `src/app/(public)/_components/NewsListSection.tsx`
- Modify: `src/app/(public)/posts/_components/PostGrid.tsx`

### Step 1: PostListSection.tsx を修正

ファイルを読み、`PostData` interface を修正:

```diff
 export interface PostData {
   readonly id: string
   readonly slug: string
   readonly title: string
   readonly excerpt: string
   readonly thumbnailUrl: string
-  readonly publishedAt: Date | null
+  readonly publishedAt: string | null
   readonly categoryName: string | null
 }
```

### Step 2: NewsListSection.tsx を修正

ファイルを読み、`NewsData` interface と `formatDate` 関数を修正:

```diff
 export interface NewsData {
   readonly id: string
   readonly slug: string
   readonly title: string
-  readonly publishedAt: Date | null
+  readonly publishedAt: string | null
 }
```

```diff
-function formatDate(date: Date | null): string {
+function formatDate(date: string | null): string {
   if (!date) return ''
   return new Intl.DateTimeFormat('ja-JP', {
```

### Step 3: PostGrid.tsx を修正

ファイルを読み、`PostCardData` interface を修正:

```diff
 interface PostCardData {
   id: string
   slug: string
   title: string
   excerpt: string
   thumbnailUrl: string
-  publishedAt: Date | string | null
+  publishedAt: string | null
   category: {
```

### Step 4: 型チェック

```bash
bun run type-check
```

Expected: エラーなし

**注意**: もし型エラーが出た場合、server 側のデータ取得関数（`Date` を渡している箇所）で `.toISOString()` 変換が必要になる可能性がある。その場合は `bun run type-check` のエラーメッセージに従って対象ファイルを修正する。

### Step 5: Commit

```bash
git add 'src/app/(public)/_components/PostListSection.tsx'
git add 'src/app/(public)/_components/NewsListSection.tsx'
git add 'src/app/(public)/posts/_components/PostGrid.tsx'
git commit -m "fix(types): align publishedAt Client Component props to string | null per React 19 serialization"
```

---

## Task 4: MediaGrid.tsx — bg-black/60 → bg-overlay

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx`

### Step 1: ファイルを読む

`src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx` を読む。

### Step 2: bg-black/60 を bg-overlay に置換

L44 付近の div:

```diff
-            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
+            <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
```

### Step 3: 型チェック

```bash
bun run type-check
```

Expected: エラーなし

### Step 4: Commit

```bash
git add 'src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx'
git commit -m "fix(admin): replace hardcoded bg-black/60 with semantic bg-overlay token"
```

---

## Task 5: 最終検証 + README 更新

### Step 1: 完全検証

```bash
bun run validate && bun run build
```

Expected: すべて通過。ビルドエラーなし。

エラーが出た場合:

- 型エラー → エラーメッセージを確認して対象ファイルを修正
- lint エラー → 指摘箇所を修正

### Step 2: テスト実行（coupon 関連）

```bash
bun run test --filter coupon
```

Expected: 既存テストがすべて pass

### Step 3: docs/plans/README.md を更新

README.md 冒頭のプロジェクト品質スコアと、完了した計画セクションに以下を追記:

```markdown
### 2026-02-20 - コード品質修正（Context API / エラーハンドリング / Date 型 / Tailwind） ✅

React 19 best practices 準拠 + エラーハンドリング強化。

**実装内容**:

- [x] Task 1: `coupon.ts` — `ActionResult` 移行 + try/catch + logError
- [x] Task 2: Context API 5ファイル — `useContext` → `use()` 移行
- [x] Task 3: Date 型 3ファイル — `string | null` に統一
- [x] Task 4: `MediaGrid.tsx` — `bg-overlay` セマンティックトークンに修正
- [x] Task 5: `bun run validate && bun run build` 全通過
```

### Step 4: 最終コミット

```bash
git add docs/plans/README.md
git commit -m "docs(plans): mark code quality fixes as complete"
```
