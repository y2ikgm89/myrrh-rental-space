# P3: Public Error / Empty / Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 公開ページの「ユーザーが行動を起こしたい瞬間に next-step CTA が消える」 dead-end を解消。error / mypage redirect / mypage loading / 検索 0 件の 4 領域に next-step を配線する。後方互換なしの clean-break。

**Architecture:** ① `error.tsx` に「お問い合わせ」CTA を追加（Error ID プリフィル）② `mypage/reservations/[id]/edit/page.tsx` の `redirect()` 3 箇所に `?reason=status|deadline|discount` を付与し、detail page で `searchParams.reason` を読んで `role="alert"` バナーを表示 ③ mypage 配下 7 つの単一スピナー `loading.tsx` を共通 `MypageSkeleton` コンポーネントで置換（card 3 枚 stack、`min-h` で layout shift 防止）④ `SpaceGrid` / `PostGrid` に `hasFilters: boolean` 必須 prop を追加し、empty + hasFilters なら「フィルタを解除」CTA Link を表示。

**Tech Stack:** Next.js 16.2 / Server Components / `next/navigation` `redirect`+`searchParams` / Editorial Button primitive。新規依存なし。

**Out of scope:** forgot-password / reset-password ルート移動（admin 専用ルートへの移動はメールテンプレート + admin login link 改修を伴うため別 plan）、マイページ Tabs 分離（P4）。

---

## Pre-flight

- [ ] **Step 0.1: ベースライン validate**

```bash
bun run validate > /tmp/validate-pre-p3.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT=0。

---

## Task 1: error.tsx に「お問い合わせ」CTA 追加（BREAKING — ボタン階層変更）

**Files:**

- Modify: `src/app/(public)/error.tsx`

**Changes:**

- 既存 2 ボタン（`再試行` / `ホームに戻る`）に **3 つ目** `お問い合わせ` を追加
- Error ID 付き subject + body プリフィル: `/contact?subject=システムエラー&body=Error ID: ${digest}`
- raw `<button>` / raw `<Link>` + 独自 hover を **Editorial Button primitive** に統一（hover パターン分散を解消）
- `editorial-consistency-reviewer` 指摘の `hover:bg-foreground hover:text-background` (Issue 4) を撤去

**Commit message:**

```
feat(public/error): add 「お問い合わせ」CTA with Error ID prefilled

Error boundary now offers a third action that pre-fills the contact form
with the digest so users can report the issue without manually copying it.
Migrate raw buttons to Button primitive (editorial variant) for consistent
hover behavior.
```

---

## Task 2: redirect reason の表示

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/page.tsx`

**Changes:**

`edit/page.tsx`:

```tsx
// Before
if (!EDITABLE_STATUSES.has(reservation.status)) {
  redirect(`/mypage/reservations/${id}`);
}
if (!isWithinDeadline(...)) {
  redirect(`/mypage/reservations/${id}`);
}
if (hasManualDiscount) {
  redirect(`/mypage/reservations/${id}`);
}

// After — 3 redirect に reason 付与
if (!EDITABLE_STATUSES.has(reservation.status)) {
  redirect(`/mypage/reservations/${id}?reason=status`);
}
if (!isWithinDeadline(...)) {
  redirect(`/mypage/reservations/${id}?reason=deadline`);
}
if (hasManualDiscount) {
  redirect(`/mypage/reservations/${id}?reason=discount`);
}
```

`[id]/page.tsx`:

- `searchParams: Promise<SearchParams>` を受け取る（ない場合は新規追加）
- `parseAsStringLiteral` で reason を validate（`"status" | "deadline" | "discount"`）
- detail コンテンツの先頭に `<RedirectReasonBanner reason={reason} />` を表示
- バナー文言:
  - `status` → 「この予約は変更できないステータスです」
  - `deadline` → 「変更可能な期限を過ぎています」
  - `discount` → 「割引が適用されているため、オンラインでは変更できません。お問い合わせください」（contact link 付き）
- `role="alert"` + `bg-warning/10 border border-warning/30 p-4` で目立たせる

**Commit message:**

```
feat(public/mypage): show redirect reason banner on reservation detail

期限切れ / ステータス不可 / 割引適用済の 3 ケースで edit ページから
detail に遷移する際、理由不明のまま戻されていた dead UX を解消。
?reason=status|deadline|discount でクエリ伝播し alert バナー表示。
```

---

## Task 3: mypage Loading Skeleton 共通化

**Files:**

- Create: `src/app/(public)/mypage/_components/mypage-skeleton.tsx`
- Modify: `src/app/(public)/mypage/loading.tsx`
- Modify: `src/app/(public)/mypage/events/loading.tsx`
- Modify: `src/app/(public)/mypage/inquiries/loading.tsx`
- Modify: `src/app/(public)/mypage/inquiries/[id]/loading.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/loading.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/edit/loading.tsx`
- Modify: `src/app/(public)/mypage/settings/loading.tsx`

**MypageSkeleton 構造:**

```tsx
"use client";

import { cn } from "@/shared/lib/cn";

type MypageSkeletonProps = {
  readonly variant?: "list" | "detail" | "form";
};

export function MypageSkeleton({ variant = "list" }: MypageSkeletonProps) {
  if (variant === "detail") {
    return (
      <div
        className="space-y-6 animate-pulse"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-8 w-1/3 bg-muted rounded" />
        <div className="h-48 bg-muted rounded" />
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }
  if (variant === "form") {
    return (
      <div
        className="space-y-4 animate-pulse"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-8 w-1/2 bg-muted rounded" />
        <div className="h-12 bg-muted rounded" />
        <div className="h-12 bg-muted rounded" />
        <div className="h-12 bg-muted rounded" />
        <div className="h-12 w-32 bg-muted rounded" />
      </div>
    );
  }
  // list (default) — 3 cards
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="border border-border p-5 space-y-3">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-6 w-2/3 bg-muted rounded" />
          <div className="h-4 w-1/3 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}
```

各 `loading.tsx` は variant を選んで render:

| ファイル                                    | variant  |
| ------------------------------------------- | -------- |
| `mypage/loading.tsx`                        | `list`   |
| `mypage/events/loading.tsx`                 | `list`   |
| `mypage/inquiries/loading.tsx`              | `list`   |
| `mypage/inquiries/[id]/loading.tsx`         | `detail` |
| `mypage/reservations/[id]/loading.tsx`      | `detail` |
| `mypage/reservations/[id]/edit/loading.tsx` | `form`   |
| `mypage/settings/loading.tsx`               | `form`   |

**Commit message:**

```
feat(public/mypage): replace single spinners with skeleton placeholders

Mypage の 7 個の loading.tsx を共通 MypageSkeleton コンポーネントで置換。
list / detail / form の 3 variant で card / detail / form の shape を mimic
し、layout shift と空白チラつきを解消。aria-busy + aria-live="polite" で
SR にロード状態を通知。
```

---

## Task 4: SpaceGrid + PostGrid Empty State CTA（BREAKING — required prop 追加）

**Files:**

- Modify: `src/app/(public)/spaces/_components/space-grid.tsx`
- Modify: `src/app/(public)/spaces/page.tsx`
- Modify: `src/app/(public)/posts/_components/post-grid.tsx`
- Modify: `src/app/(public)/posts/page.tsx`

**SpaceGrid changes:**

```tsx
// 追加 prop
interface SpaceGridProps {
  readonly spaces: readonly Space[];
  readonly reviewStats?: Readonly<Record<string, ReviewStats>>;
  readonly hasFilters: boolean; // ← required (BREAKING)
}

// Empty state を分岐
if (spaces.length === 0) {
  return (
    <div className="py-16 text-center" role="status">
      <p className="text-muted-foreground mb-6">
        {hasFilters
          ? "条件に一致するスペースが見つかりませんでした"
          : "現在公開中のスペースはありません"}
      </p>
      {hasFilters && (
        <Button asChild variant="editorial" size="sm">
          <Link href="/spaces">フィルタを解除</Link>
        </Button>
      )}
    </div>
  );
}
```

**spaces/page.tsx changes:**

```tsx
const hasFilters = Boolean(categoryId || locationId);
// ...
<SpaceGrid spaces={items} reviewStats={reviewStats} hasFilters={hasFilters} />;
```

**PostGrid 同パターン**: `hasFilters` required prop, page.tsx で `Boolean(q || category)` 判定。

**Commit message:**

```
feat(public/empty)!: add filter-clear CTA on empty SpaceGrid + PostGrid

BREAKING CHANGE: SpaceGrid と PostGrid に hasFilters: boolean を required
prop として追加。0 件時にフィルタ適用中なら「フィルタを解除」CTA を表示し、
全件未公開時は従来の「公開中のスペースはありません」テキストのみ。
ユーザーが「フィルタを外せば結果がある」ことを認識できるようになる。
```

---

## Task 5: 最終検証

```bash
bun run validate > /tmp/validate-final-p3.log 2>&1; echo "VALIDATE=$?"
bun run build > /tmp/build-final-p3.log 2>&1; echo "BUILD=$?"

# redirect reason coverage
grep -nE 'redirect\(`/mypage/reservations/\$\{id\}`\)' \
  'src/app/(public)/mypage/reservations/[id]/edit/page.tsx' \
  || echo "OK: all redirects carry reason"

# Loading spinner 残存（mypage 7 ファイル）
grep -rln "animate-spin rounded-full border-4" 'src/app/(public)/mypage/' \
  || echo "OK: zero spinner-only loading"

# SpaceGrid / PostGrid hasFilters 必須化
grep -A3 "<SpaceGrid\|<PostGrid" 'src/app/(public)/spaces/page.tsx' 'src/app/(public)/posts/page.tsx' \
  | grep -q "hasFilters" && echo "OK: hasFilters wired"
```

git log で 4 commit + 1 final commit (or 4 commit のみ) を確認。
