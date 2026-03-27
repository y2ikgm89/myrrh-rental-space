# SpaceSelector Detail Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予約フローのスペース選択カードに面積追加 + 「詳細を見る」モーダルを追加する

**Architecture:** `SpaceOption` 型とクエリを拡張してモーダルに必要なデータを取得。公開ページ用 Dialog プリミティブを新規作成し、SpaceDetailDialog でモーダル UI を実装。SpaceSelector にモーダル state と面積表示を追加。

**Tech Stack:** Next.js 16, React 19 (Compiler 1.0), TypeScript 6, Tailwind CSS 4, Radix Dialog, Prisma 7

**Spec:** `docs/superpowers/specs/2026-03-25-space-selector-detail-modal.md`

---

### Task 1: SpaceOption 型拡張 + クエリ拡張

**Files:**

- Modify: `src/shared/domain/locations/public-queries.ts`

- [ ] **Step 1: `SpaceOption` 型にフィールド追加**

```typescript
export type SpaceOption = {
  id: string;
  name: string;
  description: string;
  capacity: number;
  area: number | null;
  hourlyPrice: number;
  dailyPrice: number | null;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
};
```

- [ ] **Step 2: クエリの select にフィールド追加**

`getPublishedLocationsWithSpaces` の spaces select を拡張:

```typescript
spaces: {
  where: { isPublished: true, isActive: true },
  orderBy: { name: "asc" },
  select: {
    id: true,
    name: true,
    description: true,
    capacity: true,
    area: true,
    hourlyPrice: true,
    dailyPrice: true,
    mainImageUrl: true,
    imageUrls: true,
    facilities: true,
  },
},
```

- [ ] **Step 3: マッピングで Decimal 変換 + JSON 型ガードを追加**

`spaces` のマッピングを拡張:

```typescript
spaces: l.spaces.map((s) => ({
  ...s,
  hourlyPrice: Number(s.hourlyPrice),
  dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
  area: s.area ? Number(s.area) : null,
  imageUrls: Array.isArray(s.imageUrls)
    ? s.imageUrls.filter((u): u is string => typeof u === "string")
    : [],
  facilities: Array.isArray(s.facilities)
    ? s.facilities.filter((f): f is string => typeof f === "string")
    : [],
})),
```

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/domain/locations/public-queries.ts
git commit -m "feat(locations): expand SpaceOption with description, area, dailyPrice, facilities, imageUrls"
```

---

### Task 2: 公開ページ用 Dialog プリミティブ

**Files:**

- Create: `src/app/(public)/_shared/components/design-system/dialog.tsx`

- [ ] **Step 1: Dialog プリミティブを作成**

管理画面の `dialog.tsx` をベースに、公開ページのデザイン言語に合わせて作成:

```tsx
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity duration-200 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">閉じる</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-heading text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
```

管理画面との差分:

- `DialogOverlay`: `bg-overlay` → `bg-black/60`（公開ページに `bg-overlay` トークンは定義されていないため直接指定）
- `DialogTitle`: `font-heading` 追加（公開ページはセリフ体見出し）
- `DialogClose` の sr-only: `Close` → `閉じる`

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/design-system/dialog.tsx'
git commit -m "feat(design-system): add Dialog primitive for public pages"
```

---

### Task 3: SpaceDetailDialog コンポーネント

**Files:**

- Create: `src/app/(public)/reservation/_components/space-detail-dialog.tsx`

- [ ] **Step 1: SpaceDetailDialog を作成**

```tsx
"use client";

import type { ReactElement } from "react";
import Image from "next/image";
import { Users, Ruler } from "lucide-react";
import type { SpaceOption } from "@/shared/domain/locations/public-queries";
import { Button } from "@/public/components/design-system/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/public/components/design-system/dialog";

const YEN = "\u00A5";

export function SpaceDetailDialog({
  space,
  onOpenChange,
  onSelect,
  isSelected,
}: {
  readonly space: SpaceOption | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (id: string) => void;
  readonly isSelected: boolean;
}): ReactElement {
  const allImages =
    space !== null
      ? [space.mainImageUrl, ...space.imageUrls].filter(Boolean)
      : [];

  return (
    <Dialog open={space !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {space !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{space.name}</DialogTitle>
              {space.description.length > 0 ? (
                <DialogDescription>{space.description}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">
                  スペースの詳細情報
                </DialogDescription>
              )}
            </DialogHeader>

            {/* Image Gallery */}
            {allImages.length === 1 ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                <Image
                  src={allImages[0]}
                  alt={space.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 448px"
                  className="object-cover"
                />
              </div>
            ) : allImages.length > 1 ? (
              <div
                aria-label={`${space.name}の写真`}
                className="-mx-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-6 pb-2"
              >
                {allImages.map((url, i) => (
                  <div
                    key={url}
                    className="relative aspect-[4/3] w-[80%] shrink-0 snap-start overflow-hidden rounded-lg sm:w-[60%]"
                  >
                    <Image
                      src={url}
                      alt={`${space.name} ${String(i + 1)}`}
                      fill
                      sizes="300px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Metadata */}
            <div className="space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                <span>定員{space.capacity}名</span>
              </div>
              {space.area != null ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Ruler className="h-4 w-4 shrink-0" />
                  <span>{space.area}㎡</span>
                </div>
              ) : null}
              <div className="font-heading text-base text-accent">
                {YEN}
                {space.hourlyPrice.toLocaleString()}/h
                {space.dailyPrice != null ? (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {YEN}
                    {space.dailyPrice.toLocaleString()}/day
                  </span>
                ) : null}
              </div>
            </div>

            {/* Facilities */}
            {space.facilities.length > 0 ? (
              <div className="space-y-2 border-t border-border pt-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  設備
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {space.facilities.map((f) => (
                    <span
                      key={f}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted-foreground"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Select Button */}
            <div className="border-t border-border pt-4">
              <Button
                variant="primary"
                className="w-full"
                disabled={isSelected}
                onClick={() => {
                  onSelect(space.id);
                  onOpenChange(false);
                }}
              >
                {isSelected ? "選択中" : "このスペースを選択"}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/space-detail-dialog.tsx'
git commit -m "feat(reservation): add SpaceDetailDialog with gallery, metadata, facilities"
```

---

### Task 4: SpaceSelector に面積 + 詳細リンク + Dialog 統合

**Files:**

- Modify: `src/app/(public)/reservation/_components/space-selector.tsx`

- [ ] **Step 1: ファイルを完全書き換え**

```tsx
"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import type { SpaceOption } from "@/shared/domain/locations/public-queries";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { SpaceDetailDialog } from "./space-detail-dialog";

const YEN = "\u00A5";

export function SpaceSelector({
  spaces,
  selectedId,
  onSelect,
}: {
  readonly spaces: readonly SpaceOption[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  const isSingle = spaces.length === 1;
  const [detailSpace, setDetailSpace] = useState<SpaceOption | null>(null);

  return (
    <>
      <div
        role="radiogroup"
        aria-label="スペースを選択"
        className={
          spaces.length <= 3
            ? "grid gap-4 md:grid-cols-3"
            : "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:overflow-visible md:snap-none md:pb-0"
        }
      >
        {spaces.map((space) => {
          const isSelected = space.id === selectedId;
          return (
            <button
              key={space.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(space.id)}
              disabled={isSingle}
              className={`flex min-w-[75vw] snap-start flex-col overflow-hidden rounded-xl border text-left transition-all
                ${
                  isSelected
                    ? "border-accent ring-2 ring-accent/20 bg-accent/5"
                    : "border-border bg-card hover:border-accent/40"
                }
                ${isSingle ? "cursor-default" : "cursor-pointer"}
                md:min-w-0`}
            >
              <ImageFrame
                src={space.mainImageUrl}
                alt={space.name}
                width={400}
                height={300}
                sizes="(max-width: 768px) 75vw, 280px"
                className="aspect-[4/3] w-full"
              />
              <div className="p-3">
                <span className="font-heading text-sm font-medium tracking-tight">
                  {space.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  定員{space.capacity}名
                  {space.area != null ? ` / ${String(space.area)}㎡` : ""}
                </span>
                <span className="mt-0.5 block font-heading text-sm text-accent">
                  {YEN}
                  {space.hourlyPrice.toLocaleString()}/h
                </span>
                <button
                  type="button"
                  aria-label={`${space.name}の詳細を見る`}
                  className="mt-1.5 text-xs text-accent hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailSpace(space);
                  }}
                >
                  詳細を見る →
                </button>
              </div>
            </button>
          );
        })}
      </div>

      <SpaceDetailDialog
        space={detailSpace}
        onOpenChange={(open) => {
          if (!open) setDetailSpace(null);
        }}
        onSelect={onSelect}
        isSelected={detailSpace?.id === selectedId}
      />
    </>
  );
}
```

変更点:

- `useState` で `detailSpace` state 追加
- 面積を定員の横に追加（`/ 25㎡`）
- `/時間` → `/h` に変更
- 「詳細を見る →」ボタン追加（`e.stopPropagation()` でカード選択を防止）
- `SpaceDetailDialog` を末尾に配置
- `isSelected` は `detailSpace?.id === selectedId` で動的判定

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/space-selector.tsx'
git commit -m "feat(reservation): add area display and detail modal to SpaceSelector"
```

---

### Task 5: 全体検証

- [ ] **Step 1: validate 実行**

Run: `bun run validate`
Expected: PASS（type-check + lint）

- [ ] **Step 2: build 実行**

Run: `bun run build`
Expected: PASS

- [ ] **Step 3: lint エラーがあれば修正してコミット**
