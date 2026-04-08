# Mypage Editorial Magazine Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マイページ全体を Editorial Magazine (Kinfolk/Cereal) デザインシステムに統一し、レスポンシブ問題を修正する。

**Architecture:** 共通ステータスヘルパー統一 → ナビ editorial 化 → カード・詳細の typography/hover 修正 → 日付フォーマット統一 → 空状態 editorial 化 → layout を PageLayout 対応

**Tech Stack:** Tailwind 4 semantic tokens, Design System Primitives, `@/shared/lib/date-format`

---

### Task 1: ステータスラベル・バリアントの重複定義を解消

**Files:**

- Modify: `src/app/(public)/mypage/_components/reservation-card.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`

現在 `reservation-card.tsx` と `reservation-detail.tsx` の両方で `STATUS_LABELS`, `STATUS_VARIANTS` を独自定義している。`enums/helpers.ts` の `RESERVATION_STATUS_LABELS` を使用する。

公開ページ用 Badge variant は公開 Badge 型（`"default" | "success" | "warning" | "info"`）と管理 Badge 型（shadcn）が異なるため、マイページ内にマッピング定数を1箇所だけ定義する。

- [ ] **Step 1: reservation-card.tsx — ローカル STATUS_LABELS/STATUS_VARIANTS を削除し、helpers.ts のラベルと公開 Badge variant マッピングを使用**

```typescript
// 削除: STATUS_LABELS, STATUS_VARIANTS, getStatusLabel, getStatusVariant のローカル定義

// 追加 import:
import { RESERVATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";

// 公開 Badge variant マッピング（ファイル内に定義 — 公開/管理で variant 型が異なるため）
const RESERVATION_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  PENDING: "warning",
  CONFIRMED: "success",
  COMPLETED: "info",
  CANCELLED: "default",
  NO_SHOW: "default",
};

// 使用箇所:
// getStatusLabel(status) → RESERVATION_STATUS_LABELS[status] ?? status
// getStatusVariant(status) → RESERVATION_BADGE_VARIANTS[status] ?? "default"
```

- [ ] **Step 2: reservation-detail.tsx — 同様にローカル定義を削除して helpers.ts を使用**

同じパターンで `STATUS_LABELS`, `STATUS_VARIANTS`, `getStatusLabel`, `getStatusVariant` を削除し、`RESERVATION_STATUS_LABELS` と `RESERVATION_BADGE_VARIANTS` を使用。`TAX_RATE_LABELS` はこのファイル固有なのでそのまま残す。

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`

- [ ] **Step 4: コミット**

```
git commit -m "refactor(mypage): unify reservation status labels with enums/helpers"
```

---

### Task 2: 日付フォーマット関数の重複を解消

**Files:**

- Modify: `src/app/(public)/mypage/_components/reservation-card.tsx`
- Modify: `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`
- Modify: `src/app/(public)/mypage/inquiries/_components/inquiry-list.tsx`

- [ ] **Step 1: reservation-card.tsx — ローカル formatDateTime/formatTimeOnly を削除し、shared 関数を使用**

```typescript
// 削除: formatDateTime, formatTimeOnly のローカル定義

// 追加 import:
import { formatSerializedDate } from "@/shared/lib/serialize";

// 使用箇所を変更:
// formatDateTime(startTime) → formatSerializedDate(startTime, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
// formatTimeOnly(endTime) → formatSerializedDate(endTime, { hour: "2-digit", minute: "2-digit" })
```

- [ ] **Step 2: reservation-detail.tsx — ローカル formatDate/formatTime/formatCreatedAt を削除し、shared 関数を使用**

```typescript
// 削除: formatDate, formatTime, formatCreatedAt のローカル定義

// 追加 import:
import { formatSerializedDate } from "@/shared/lib/serialize";

// formatDate(startTime) → formatSerializedDate(startTime, { year: "numeric", month: "long", day: "numeric", weekday: "short" })
// formatTime(startTime) → formatSerializedDate(startTime, { hour: "2-digit", minute: "2-digit" })
// formatCreatedAt(createdAt) → formatSerializedDate(createdAt)  (デフォルト形式)
```

- [ ] **Step 3: inquiry-list.tsx — new Date().toLocaleDateString を formatSerializedDate に置換**

```typescript
// 変更前:
{
  new Date(inquiry.createdAt).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// 変更後:
import { formatSerializedDate } from "@/shared/lib/serialize";
{
  formatSerializedDate(inquiry.createdAt);
}
```

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`

- [ ] **Step 5: コミット**

```
git commit -m "refactor(mypage): replace local date formatters with shared formatSerializedDate"
```

---

### Task 3: MypageNav を Editorial スタイルに統一

**Files:**

- Modify: `src/app/(public)/mypage/_components/mypage-nav.tsx`

モバイルで文字が詰まる問題 + Editorial Magazine のナビスタイルに統一。
Journal タブのパターン（`role="tab"` + aria-selected + uppercase tracking）を踏襲。

- [ ] **Step 1: MypageNav を editorial tab スタイルにリライト**

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
  { href: "/mypage/events", label: "イベント" },
  { href: "/mypage/inquiries", label: "お問い合わせ" },
  { href: "/mypage/settings", label: "設定" },
];

export function MypageNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="マイページナビゲーション"
      className="mb-8 md:mb-12 border-b border-border overflow-x-auto"
    >
      <div className="flex" role="tablist">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/mypage"
              ? pathname === "/mypage"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "shrink-0 px-4 py-3 text-[0.7rem] uppercase tracking-[0.18em] transition-colors whitespace-nowrap",
                isActive
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

変更点:

- ラベル短縮: 「イベント申込」→「イベント」、「アカウント設定」→「設定」（モバイル幅対策）
- `text-[0.7rem] uppercase tracking-[0.18em]` で editorial 統一
- `overflow-x-auto` + `whitespace-nowrap` + `shrink-0` でモバイルスクロール
- `role="tablist"` + `role="tab"` + `aria-selected` で a11y 準拠
- `font-medium` 削除（Editorial は `font-light` が基本、ナビは normal weight）
- `mb-4 md:mb-8` → `mb-8 md:mb-12` で editorial 余白

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```
git commit -m "refactor(mypage): redesign nav tabs to editorial magazine style"
```

---

### Task 4: 予約カードの Editorial 化

**Files:**

- Modify: `src/app/(public)/mypage/_components/reservation-card.tsx`

- [ ] **Step 1: カードのタイポグラフィとアクションを editorial 化**

変更点:

- `Heading level={3} className="!text-lg"` → `Heading level={3}` のみ（level 3 は sans normal）
- アクションリンクの `text-accent hover:bg-accent/5` → `text-muted-foreground hover:text-foreground` で控えめに（Editorial 準拠）
- キャンセルリンクの `text-destructive hover:bg-destructive/5` → `text-destructive hover:text-destructive/80`
- `inline-block px-3 py-1.5` のタッチターゲットは維持

```typescript
// 変更前:
<Link
  href={`/mypage/reservations/${id}`}
  className="inline-block px-3 py-1.5 text-sm text-accent hover:bg-accent/5 transition-colors"
>

// 変更後:
<Link
  href={`/mypage/reservations/${id}`}
  className="inline-block px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
>
```

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```
git commit -m "refactor(mypage): apply editorial typography and hover patterns to reservation card"
```

---

### Task 5: 予約詳細の Editorial 化 + 戻るリンク修正

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`

- [ ] **Step 1: 「← 予約一覧に戻る」を Button + テキストに変更**

```typescript
// 変更前:
<Link href="/mypage" className="text-sm text-accent hover:underline">
  ← 予約一覧に戻る
</Link>

// 変更後:
<Link
  href="/mypage"
  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
>
  予約一覧に戻る
</Link>
```

お問い合わせリンクも同様:

```typescript
// 変更前: text-muted-foreground hover:text-foreground — これは OK（変更不要）
```

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```
git commit -m "refactor(mypage): remove arrow entity and apply editorial link style in reservation detail"
```

---

### Task 6: お問い合わせ詳細の Editorial 化

**Files:**

- Modify: `src/app/(public)/mypage/inquiries/[id]/page.tsx`

- [ ] **Step 1: 戻るリンクの `&larr;` 削除 + editorial スタイル**

```typescript
// 変更前:
<Link
  href="/mypage/inquiries"
  className="text-sm text-muted-foreground hover:text-foreground"
>
  &larr; お問い合わせ一覧に戻る
</Link>

// 変更後:
<Link
  href="/mypage/inquiries"
  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
>
  お問い合わせ一覧に戻る
</Link>
```

- [ ] **Step 2: コミット**

```
git commit -m "refactor(mypage): remove arrow entity from inquiry detail back link"
```

---

### Task 7: 空状態を Editorial スタイルに統一

**Files:**

- Modify: `src/app/(public)/mypage/_components/reservation-list.tsx`
- Modify: `src/app/(public)/mypage/inquiries/page.tsx`
- Modify: `src/app/(public)/mypage/events/_components/event-registration-list.tsx`

現在: `border border-border bg-surface p-6 md:p-12 text-center`
目標: Journal パターンに統一 — `py-[var(--spacing-section)] text-center`（背景・枠なし、Editorial の余白で分離）

- [ ] **Step 1: reservation-list.tsx の空状態**

```typescript
// 変更前:
<div className="border border-border bg-surface p-6 md:p-12 text-center">
  <p className="text-muted-foreground">予約がありません</p>
</div>

// 変更後:
<div className="py-16 md:py-24 text-center">
  <p className="text-sm text-muted-foreground">予約がありません</p>
</div>
```

- [ ] **Step 2: inquiries/page.tsx の空状態**

同パターンで `border border-border bg-surface p-6 md:p-12` → `py-16 md:py-24`。

- [ ] **Step 3: event-registration-list.tsx の空状態**

同パターン。

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`

- [ ] **Step 5: コミット**

```
git commit -m "refactor(mypage): apply editorial empty state pattern (no borders, generous whitespace)"
```

---

### Task 8: ProfileForm のレスポンシブ修正

**Files:**

- Modify: `src/app/(public)/mypage/settings/_components/profile-form.tsx`

- [ ] **Step 1: max-w-md 削除 + メール説明文の -mt-2 修正**

```typescript
// 変更前:
<form onSubmit={onSubmit} className="max-w-md space-y-6">

// 変更後:
<form onSubmit={onSubmit} className="space-y-6">
```

```typescript
// 変更前:
<p className="text-xs text-muted-foreground -mt-2">

// 変更後（space-y-6 の間隔を維持しつつ、Input と説明文の距離を縮める）:
<p className="text-xs text-muted-foreground -mt-4">
```

- [ ] **Step 2: コミット**

```
git commit -m "fix(mypage): remove max-w-md constraint and fix negative margin in profile form"
```

---

### Task 9: layout.tsx を PageLayout variant="dashboard" に移行

**Files:**

- Modify: `src/app/(public)/mypage/layout.tsx`

- [ ] **Step 1: layout.tsx で Container を PageLayout に置換**

```typescript
// 変更前:
import { Container } from "@/public/components/design-system/container";

return (
  <section className="py-[var(--spacing-block)]">
    <Container>
      <MypageNav />
      {children}
    </Container>
  </section>
);

// 変更後:
import { PageLayout } from "@/public/components/design-system/page-layout";

return (
  <PageLayout variant="dashboard">
    <MypageNav />
    {children}
  </PageLayout>
);
```

`PageLayout variant="dashboard"` は内部で `<Container>` + `py-[var(--spacing-block)]` を適用するため、手動の `section` + `Container` ラッピングは不要になる。

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```
git commit -m "refactor(mypage): migrate layout to PageLayout variant=dashboard"
```

---

### Task 10: 最終検証

- [ ] **Step 1: validate 実行**

Run: `bun run validate`

- [ ] **Step 2: build 実行**

Run: `bun run build`

- [ ] **Step 3: ローカルフォーマット関数の残存チェック**

```bash
grep -rn "function format" 'src/app/(public)/mypage/'
```

Expected: 出力なし（共有関数に統一済み）

- [ ] **Step 4: hover:text-accent の残存チェック**

```bash
grep -rn "hover:text-accent" 'src/app/(public)/mypage/'
```

Expected: 出力なし

- [ ] **Step 5: STATUS_LABELS ローカル定義の残存チェック**

```bash
grep -rn "STATUS_LABELS\s*:" 'src/app/(public)/mypage/'
```

Expected: RESERVATION_BADGE_VARIANTS のみ（公開 Badge 用マッピング）
