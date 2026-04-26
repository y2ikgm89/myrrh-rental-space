# P1: a11y Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WCAG 2.2 AA + 2.5.5 Enhanced (AAA) のハードルール（CLAUDE.md）を全 interactive 要素で達成し、ARIA 属性の欠落を埋め、Lightbox を Radix Dialog に統一する。後方互換なしの clean-break。

**Architecture:** ① 共通 `CheckboxCell` ラッパーを新設して管理画面 table の 16px native checkbox を 44px ヒットエリアに一括化 ② 公開・管理の `h-10` / `h-8` interactive 要素を `h-11` / `min-h-11` に統一 ③ `SortableColumnHeader` の `<TableHead>` に `aria-sort` を付与 ④ `PublishSwitch` に `aria-label` 必須 prop を追加して Switch まで forward ⑤ `BulkActions` 4 ファイルの選択件数 span を `aria-live="polite" aria-atomic="true"` 化 ⑥ `ImageGallery` の自前 `LightboxOverlay` を Radix Dialog に置換し、focus 復帰・focus trap・Escape を Radix 標準に委譲 ⑦ 公開 `image-carousel` の dot ボタンを WAI-ARIA 誤用 (`role="tab"` 単独) から `role="button" aria-current` に矯正。

**Tech Stack:** Next.js 16.2 / React 19.2 / Tailwind 4.2 / Radix UI Dialog / Tabler Icons / `cn()` (`@/shared/lib/cn`)。新規 npm 依存なし（Radix Dialog は既存）。

**Compliance:**

- WCAG 2.2 SC 2.5.5 Enhanced (AAA) — 全 interactive 要素 44×44 CSS px（CLAUDE.md ハードルール、`accessibility.md` §タッチターゲット）
- WAI-ARIA APG `Sortable Table` — `<th aria-sort="ascending|descending|none">` ([w3.org](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table))
- WAI-ARIA APG `Switch` — `aria-label` または `aria-labelledby` 必須（Radix `<Switch>` は `role="switch"` を生成）
- WAI-ARIA APG `Live Region` — Status messages は `aria-live="polite" aria-atomic="true"`
- Radix Dialog — focus trap / `onCloseAutoFocus`（focus 復帰）/ `aria-labelledby` 自動 / Escape クローズ自動

**Out of scope（後続 plan）:** Empty/Error/Redirect の next-step CTA（P3）、マイページ Tabs 分離（P4）、admin Cmd+K（P5）、トークン整合（P2）。

---

## File Structure

| ファイル                                                                                | 役割                                                            | 変更種別                 |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| `src/app/(admin)/admin/(dashboard)/_shared/components/table/CheckboxCell.tsx`           | 共通 44px checkbox ラッパー                                     | **新規**                 |
| `src/app/(admin)/admin/(dashboard)/_shared/components/table/SortableColumnHeader.tsx`   | `aria-sort` を `<TableHead>` に付与                             | 修正                     |
| `src/app/(admin)/admin/(dashboard)/_shared/components/ui/PublishSwitch.tsx`             | `aria-label` 必須 prop 追加                                     | 修正（**API 破壊変更**） |
| `src/app/(admin)/admin/(dashboard)/_shared/components/ui/Pagination.tsx`                | 数字ボタンの `h-8 w-8` override 削除                            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx`                    | trigger を `h-11 w-11` 化 + `aria-label` 動的化                 | 修正                     |
| `src/app/(admin)/admin/(dashboard)/posts/_components/PostTableHeader.tsx`               | 全選択 checkbox を CheckboxCell 化                              | 修正                     |
| `src/app/(admin)/admin/(dashboard)/posts/_components/PostTable.tsx`                     | 行 checkbox を CheckboxCell 化 + 意味ある aria-label            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTableHeader.tsx` | 同上                                                            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx`       | 同上                                                            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/pages/_components/PageTableHeader.tsx`               | 同上                                                            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/pages/_components/PageTable.tsx`                     | 同上                                                            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/posts/_components/PostBulkActions.tsx`               | 件数 span を `aria-live` 化                                     | 修正                     |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationBulkActions.tsx` | 同上                                                            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/pages/_components/BulkActions.tsx`                   | 同上                                                            | 修正                     |
| `src/app/(admin)/admin/(dashboard)/faq/_components/FaqBulkActions.tsx`                  | 同上                                                            | 修正                     |
| `src/app/(public)/_shared/components/layouts/site-header.tsx`                           | hamburger / close を `h-11 w-11` 化                             | 修正                     |
| `src/app/(public)/_shared/components/ui/share-buttons.tsx`                              | `BUTTON_CLASSES` の `min-h-10` → `min-h-11`                     | 修正                     |
| `src/app/(public)/_shared/components/sidebar/sidebar-custom.tsx`                        | リンクを `inline-flex min-h-11` 化                              | 修正                     |
| `src/app/(public)/_shared/components/ui/image-gallery.tsx`                              | 自前 Lightbox を Radix Dialog 化                                | **大規模修正**           |
| `src/app/(public)/spaces/_components/image-carousel.tsx`                                | nav 矢印 `h-8` → `h-11`、dot を `role="button" aria-current` 化 | 修正                     |
| `src/app/(public)/reservation/_components/guest-stepper.tsx`                            | `h-10 w-10` → `h-11 w-11`、input `h-10` → `h-11`                | 修正                     |
| `src/app/(public)/reservation/_components/time-slot-grid.tsx`                           | `min-h-10` → `min-h-11`                                         | 修正                     |
| `src/app/(public)/events/_components/calendar-month-nav.tsx`                            | `h-10` → `h-11`（CHEVRON_BUTTON_CLASS + 今月ボタン）            | 修正                     |
| `src/app/(public)/events/_components/month-picker.tsx`                                  | 年送り `h-8 w-8` → `h-11 w-11`                                  | 修正                     |
| `docs/architecture/decisions/0022-checkbox-cell-44px-wrapper.md`                        | ADR                                                             | **新規**                 |

---

## Pre-flight Verification

- [ ] **Step 0.1: 既存 ADR 番号確認**

```bash
ls docs/architecture/decisions/ | grep "^00" | sort
```

Expected: `0022` 以降が未使用なら `0022-checkbox-cell-44px-wrapper.md` で確定。既に `0022` が存在する場合は次の空き番号を使う。

- [ ] **Step 0.2: 対象ファイルの実在確認**

```bash
ls src/app/\(admin\)/admin/\(dashboard\)/posts/_components/PostTableHeader.tsx \
   src/app/\(admin\)/admin/\(dashboard\)/posts/_components/PostTable.tsx \
   src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/ReservationTableHeader.tsx \
   src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/ReservationTable.tsx \
   src/app/\(admin\)/admin/\(dashboard\)/pages/_components/PageTableHeader.tsx \
   src/app/\(admin\)/admin/\(dashboard\)/pages/_components/PageTable.tsx \
   src/app/\(public\)/spaces/_components/image-carousel.tsx \
   src/app/\(public\)/reservation/_components/time-slot-grid.tsx \
   src/app/\(public\)/events/_components/month-picker.tsx
```

Expected: 全 9 ファイル exit 0。1 つでも欠落していれば該当 task をスコープ調整。

- [ ] **Step 0.3: ベースライン validate**

```bash
bun run validate > /tmp/validate-pre.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`。0 でない場合はベースラインを記録（既存 lint warning は対象外として除外、新規導入分のみを diff 評価）。

---

## Task 1: ADR 0022 — CheckboxCell 44px wrapper

**Files:**

- Create: `docs/architecture/decisions/0022-checkbox-cell-44px-wrapper.md`

- [ ] **Step 1.1: ADR を書く**

````markdown
# 0022. 管理画面 table の checkbox は CheckboxCell ラッパーで 44px ヒットエリア化

- Status: Accepted
- Date: 2026-04-26

## Context

CLAUDE.md ハードルール「全 interactive 要素は WCAG 2.5.5 Enhanced (AAA) 準拠 44×44 CSS px 必須」に対し、管理画面の posts / reservations / pages / faq テーブルの全選択 checkbox + 行 checkbox が `<input type="checkbox" className="h-4 w-4">`（16px）の裸配置で WCAG 2.5.5 を大幅に下回っていた。`accessibility.md` の OK パターン例「checkbox は label wrapper で 44px」を共通コンポーネントとして昇格する。

## Decision

`@/admin/components/table/CheckboxCell` を新設し、管理画面の全 table checkbox を統一する。

```tsx
<CheckboxCell
  checked={isSelected}
  onChange={handleChange}
  aria-label="この行を選択"
/>
```
````

実装は `<label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">` で 44px ヒットエリアを確保し、内部 `<input type="checkbox" className="h-4 w-4">` の visual サイズを保つ（業界標準: GitHub / Linear / Asana の table checkbox と同等）。

## Consequences

- 管理画面 table checkbox の WCAG 2.5.5 Enhanced (AAA) 準拠が一括達成される
- `<input type="checkbox">` の裸配置は table 配下では原則禁止（このパターンを横断 grep で検出）
- 公開ページの checkbox（agreeToTerms 等）は既に label wrapper を持つため対象外

````

- [ ] **Step 1.2: commit**

```bash
git add docs/architecture/decisions/0022-checkbox-cell-44px-wrapper.md
git commit -m "$(cat <<'EOF'
docs(adr): 0022 CheckboxCell 44px wrapper for admin tables

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
````

---

## Task 2: CheckboxCell 共通コンポーネント

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/table/CheckboxCell.tsx`

- [ ] **Step 2.1: 実装**

```tsx
"use client";

import type { ChangeEvent } from "react";
import { cn } from "@/shared/lib/cn";

type CheckboxCellProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly indeterminate?: boolean;
  readonly className?: string;
  readonly "aria-label": string;
};

/**
 * 管理画面 table 用 44px ヒットエリア checkbox（ADR 0022）。
 * WCAG 2.5.5 Enhanced (AAA) 準拠。
 */
export function CheckboxCell({
  checked,
  onChange,
  disabled,
  indeterminate,
  className,
  "aria-label": ariaLabel,
}: CheckboxCellProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <label
      className={cn(
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate ?? false;
        }}
        aria-label={ariaLabel}
        className="h-4 w-4 cursor-pointer rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </label>
  );
}
```

- [ ] **Step 2.2: 検証**

```bash
bun run type-check 2>&1 | tail -20
```

Expected: 新規ファイルに関するエラーなし。

- [ ] **Step 2.3: commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/table/CheckboxCell.tsx
git commit -m "$(cat <<'EOF'
feat(admin/table): add CheckboxCell with 44px hit area (ADR 0022)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 管理画面 table の checkbox を CheckboxCell に置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostTableHeader.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostTable.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTableHeader.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/_components/PageTableHeader.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/_components/PageTable.tsx`

- [ ] **Step 3.1: 各 \*TableHeader の全選択 checkbox を CheckboxCell に置換**

各 TableHeader で:

```tsx
// Before
<input
  type="checkbox"
  checked={allSelected}
  onChange={(e) => onToggleAll(e.target.checked)}
  className="h-4 w-4 cursor-pointer rounded border-border"
  aria-label="すべて選択"
/>

// After
<CheckboxCell
  checked={allSelected}
  onChange={onToggleAll}
  aria-label="すべての行を選択"
/>
```

- [ ] **Step 3.2: 各 \*Table の行 checkbox を CheckboxCell に置換 + 意味ある aria-label**

`PostTable.tsx` 例:

```tsx
// Before
<input type="checkbox" ... aria-label={`${post.id.slice(0,8)}を選択`} />

// After: 行を識別できる意味のあるラベル
<CheckboxCell
  checked={selectedIds.includes(post.id)}
  onChange={(checked) => onToggleRow(post.id, checked)}
  aria-label={`${post.title} を選択`}
/>
```

`ReservationTable.tsx` の aria-label:

```tsx
aria-label={`${formatDateTime(reservation.startAt)} ${reservation.space.name} の予約を選択`}
```

`PageTable.tsx` の aria-label:

```tsx
aria-label={`${page.title} を選択`}
```

- [ ] **Step 3.3: 検証**

```bash
bun run type-check 2>&1 | tail -20
```

Expected: 0 errors。失敗時は CheckboxCell の prop signature と consumer の差分を再確認。

- [ ] **Step 3.4: visual 確認（dev server）**

```bash
# dev server が稼働中前提
echo "manual: open http://localhost:3000/admin/posts and verify 44px hit area on checkboxes"
```

- [ ] **Step 3.5: commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/_components/PostTableHeader.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/posts/_components/PostTable.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/ReservationTableHeader.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/ReservationTable.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/pages/_components/PageTableHeader.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/pages/_components/PageTable.tsx
git commit -m "$(cat <<'EOF'
refactor(admin/tables): adopt CheckboxCell across posts/reservations/pages

WCAG 2.5.5 Enhanced (AAA) 準拠の 44px ヒットエリアを全 admin table checkbox に
適用。行 checkbox の aria-label を意味のある識別子（タイトル / 予約日時 + スペース名）
に統一し SR ユーザーの対象判別性を向上。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SortableColumnHeader に aria-sort 付与

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/table/SortableColumnHeader.tsx`

- [ ] **Step 4.1: 修正**

```tsx
"use client";

import type { ReactNode } from "react";
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react";
import { TableHead } from "@/admin/components/ui";

type SortableColumnHeaderProps<T extends string> = {
  column: T;
  currentSortBy: T | null;
  currentSortOrder: "asc" | "desc";
  onSort: (column: T) => void;
  children: ReactNode;
  className?: string;
};

export function SortableColumnHeader<T extends string>({
  column,
  currentSortBy,
  currentSortOrder,
  onSort,
  children,
  className,
}: SortableColumnHeaderProps<T>) {
  const isActive = currentSortBy === column;
  const ariaSort: "ascending" | "descending" | "none" = isActive
    ? currentSortOrder === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const directionLabel = isActive
    ? currentSortOrder === "asc"
      ? "昇順"
      : "降順"
    : "未ソート";

  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(column)}
      >
        {children}
        <span className="sr-only">（{directionLabel}）</span>
        {isActive ? (
          currentSortOrder === "asc" ? (
            <IconArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <IconArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          )
        ) : (
          <IconArrowsSort
            className="h-3.5 w-3.5 text-muted-foreground/50"
            aria-hidden="true"
          />
        )}
      </button>
    </TableHead>
  );
}
```

**変更点:**

- `<TableHead>` に `aria-sort={ascending|descending|none}` を付与（WAI-ARIA APG `Sortable Table` 公式パターン）
- button に `min-h-11` 追加で 44px タッチターゲット確保
- icon に `aria-hidden="true"` 明示
- SR 用 `sr-only` 方向ラベル（「昇順」/「降順」/「未ソート」）

- [ ] **Step 4.2: 検証 + commit**

```bash
bun run type-check 2>&1 | tail -10
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/table/SortableColumnHeader.tsx
git commit -m "$(cat <<'EOF'
feat(a11y): add aria-sort to SortableColumnHeader (WAI-ARIA APG)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PublishSwitch に aria-label 必須 prop 追加（API 破壊変更）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/PublishSwitch.tsx`
- Modify: 全 PublishSwitch consumer（grep で特定）

- [ ] **Step 5.1: consumer を grep**

```bash
grep -rln "PublishSwitch" src/app/\(admin\)/admin/\(dashboard\)/ --include="*.tsx"
```

Expected: spaces / posts / news / pages / faq / coupons 等の `*ActionCell.tsx` または `*Table.tsx` がヒット。

- [ ] **Step 5.2: PublishSwitch.tsx を修正**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "./switch";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

type PublishSwitchProps<TData = unknown> = {
  id: string;
  isPublished: boolean;
  onToggle: (id: string, checked: boolean) => Promise<MutationResult<TData>>;
  /** 操作対象を識別する SR ラベル（例: 「{title} の公開状態」）— 必須 */
  resourceLabel: string;
  label?: { published: string; unpublished: string };
};

export function PublishSwitch<TData = unknown>({
  id,
  isPublished,
  onToggle,
  resourceLabel,
  label = {
    published: PUBLISH_LABELS.published,
    unpublished: PUBLISH_LABELS.unpublished,
  },
}: PublishSwitchProps<TData>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await onToggle(id, checked);
      if (!isMutationError(result)) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Switch
        checked={isPublished}
        onCheckedChange={handleChange}
        disabled={isPending}
        aria-label={`${resourceLabel}（現在: ${isPublished ? label.published : label.unpublished}）`}
      />
      <span className="text-xs text-muted-foreground" aria-hidden="true">
        {isPublished ? label.published : label.unpublished}
      </span>
    </div>
  );
}
```

**変更点:**

- `resourceLabel` を **必須** prop に追加（破壊変更、後方互換なし）
- `<Switch>` に `aria-label` を forward
- 視覚ラベル span を `aria-hidden="true"` 化（重複読み上げ防止）

- [ ] **Step 5.3: 全 consumer を更新**

各 `<PublishSwitch>` 呼び出しに `resourceLabel` を追加。例:

```tsx
// Before
<PublishSwitch id={post.id} isPublished={post.isPublished} onToggle={togglePostPublish} />

// After
<PublishSwitch
  id={post.id}
  isPublished={post.isPublished}
  onToggle={togglePostPublish}
  resourceLabel={`${post.title} の公開状態`}
/>
```

スペース / ページ / FAQ / News / クーポン等も同様に `${entity.name} の公開状態` パターンで統一。

- [ ] **Step 5.4: 検証**

```bash
bun run type-check 2>&1 | tail -20
```

Expected: 0 errors。`resourceLabel` 未指定の consumer が残ると TS2741（property missing）。

- [ ] **Step 5.5: commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(a11y)!: add required resourceLabel to PublishSwitch

BREAKING CHANGE: PublishSwitch now requires resourceLabel prop forwarded to
the underlying Radix Switch as aria-label. SR users were previously hearing
"スイッチ オン/オフ" with no resource context. The visual label span is now
aria-hidden to avoid duplicate announcement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: BulkActions の選択件数を aria-live 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostBulkActions.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationBulkActions.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/_components/BulkActions.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqBulkActions.tsx`

- [ ] **Step 6.1: 各 BulkActions の選択件数 span に aria-live 付与**

```tsx
// Before
<span className="text-sm font-medium">{selectedIds.length}件選択中</span>

// After
<span
  className="text-sm font-medium"
  aria-live="polite"
  aria-atomic="true"
>
  {selectedIds.length}件選択中
</span>
```

WCAG 4.1.3 Status Messages 準拠。`aria-atomic="true"` で region 全体を 1 メッセージとして読み上げ。

- [ ] **Step 6.2: 検証 + commit**

```bash
bun run type-check 2>&1 | tail -10
git add src/app/\(admin\)/admin/\(dashboard\)/posts/_components/PostBulkActions.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/ReservationBulkActions.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/pages/_components/BulkActions.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/faq/_components/FaqBulkActions.tsx
git commit -m "$(cat <<'EOF'
feat(a11y): announce bulk selection count with aria-live (WCAG 4.1.3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: NotificationBell + Pagination 数字ボタン 44px 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/Pagination.tsx`

- [ ] **Step 7.1: NotificationBell trigger を 44px + aria-label 動的化**

```tsx
<PopoverTrigger asChild>
  <button
    type="button"
    className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    aria-label={
      unreadCount > 0
        ? `通知（未読${unreadCount > 99 ? "99件以上" : `${String(unreadCount)}件`}）`
        : "通知"
    }
  >
    <IconBell className="h-5 w-5" aria-hidden="true" />
    {unreadCount > 0 && (
      <span
        aria-hidden="true"
        className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground"
      >
        {unreadCount > 99 ? "99+" : String(unreadCount)}
      </span>
    )}
  </button>
</PopoverTrigger>
```

**変更点:**

- `p-2` → `h-11 w-11 inline-flex items-center justify-center`（44px 確定）
- `aria-label` を `unreadCount` で動的に変化（SR が件数を 1 度だけ読み上げ）
- バッジ span を `aria-hidden="true"`（aria-label に件数が含まれるため重複防止）
- Bell アイコンに `aria-hidden="true"` 明示

- [ ] **Step 7.2: Pagination 数字ボタンの h-8 w-8 override を削除**

```tsx
// Before
<Button
  key={page}
  variant={page === currentPage ? "default" : "outline"}
  size="sm"
  className="h-8 w-8 p-0"
  onClick={() => goToPage(page)}
  disabled={isPending}
  aria-current={page === currentPage ? "page" : undefined}
>
  {page}
</Button>

// After: size="sm" の min-h-11 が効くよう h-8 w-8 override を削除、min-w-11 を維持
<Button
  key={page}
  variant={page === currentPage ? "default" : "outline"}
  size="sm"
  className="min-w-11 px-0"
  onClick={() => goToPage(page)}
  disabled={isPending}
  aria-current={page === currentPage ? "page" : undefined}
>
  {page}
</Button>
```

ellipsis span も `min-h-11 min-w-11` に変更:

```tsx
<span
  /* eslint-disable-next-line @eslint-react/no-array-index-key */
  key={`ellipsis-${i}`}
  aria-hidden
  className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-muted-foreground"
>
  ...
</span>
```

- [ ] **Step 7.3: 検証 + commit**

```bash
bun run type-check 2>&1 | tail -10
git add src/app/\(admin\)/admin/\(dashboard\)/_components/NotificationBell.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ui/Pagination.tsx
git commit -m "$(cat <<'EOF'
fix(a11y): NotificationBell + Pagination meet 44px touch target

- NotificationBell trigger: p-2 (36px) → h-11 w-11 (44px), unread count
  merged into aria-label to avoid duplicate SR announcement
- Pagination number buttons: drop h-8 w-8 override, let Button size="sm"
  min-h-11 take effect, retain min-w-11 for square shape

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 公開ページ タッチターゲット 44px 一括修正

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/site-header.tsx`
- Modify: `src/app/(public)/_shared/components/ui/share-buttons.tsx`
- Modify: `src/app/(public)/_shared/components/sidebar/sidebar-custom.tsx`
- Modify: `src/app/(public)/spaces/_components/image-carousel.tsx`
- Modify: `src/app/(public)/reservation/_components/guest-stepper.tsx`
- Modify: `src/app/(public)/reservation/_components/time-slot-grid.tsx`
- Modify: `src/app/(public)/events/_components/calendar-month-nav.tsx`
- Modify: `src/app/(public)/events/_components/month-picker.tsx`

- [ ] **Step 8.1: site-header.tsx の hamburger / close を h-11 w-11**

```tsx
// Trigger (line 423)
<Dialog.Trigger
  className="inline-flex h-11 w-11 items-center justify-center justify-self-end text-foreground md:hidden"
  aria-label="メニューを開く"
>

// Close (line 449)
<Dialog.Close
  className="inline-flex h-11 w-11 items-center justify-center text-foreground"
  aria-label="メニューを閉じる"
>
```

- [ ] **Step 8.2: share-buttons.tsx の BUTTON_CLASSES**

```tsx
const BUTTON_CLASSES =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:border-accent hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
```

`min-h-10` → `min-h-11`。

- [ ] **Step 8.3: sidebar-custom.tsx のリンクを inline-flex min-h-11 化**

```tsx
const SIDEBAR_CTA_CLASS =
  "mt-3 inline-flex min-h-11 items-center justify-center border border-foreground px-4 text-xs uppercase tracking-[0.18em] transition-colors hover:bg-accent hover:text-accent-foreground";

// Link / a の className を SIDEBAR_CTA_CLASS で統一
```

`inline-block px-4 py-2 text-xs`（28px）→ `inline-flex min-h-11`（44px）。`py-2` 削除（`min-h-11` が高さ確保）。

- [ ] **Step 8.4: image-carousel.tsx の nav 矢印 + dot 修正**

```tsx
// nav 矢印（line 121, 141 周辺）
<button
  className="inline-flex h-11 w-11 items-center justify-center rounded-full ..."
  aria-label="前の画像"
>

// dot ボタン（line 164-178）— role="tab" を削除、role="button" + aria-current で正規化
<button
  type="button"
  role="button"
  aria-label={`画像 ${i + 1} 枚目を表示`}
  aria-current={i === activeIndex ? "true" : undefined}
  onClick={() => setActiveIndex(i)}
  className="inline-flex min-h-11 min-w-11 items-center justify-center"
>
  <span
    aria-hidden="true"
    className={cn(
      "block h-1.5 rounded-full transition-all",
      i === activeIndex ? "w-6 bg-foreground" : "w-1.5 bg-foreground/30",
    )}
  />
</button>
```

`role="tab"` 単独使用は WAI-ARIA APG 違反（`tablist` + `tabpanel` セットが必須）。dot は image index 切替なので `role="button" aria-current` が semantically 正しい。

- [ ] **Step 8.5: guest-stepper.tsx の +/- ボタン + input を h-11**

```tsx
<button
  type="button"
  aria-label="利用人数を減らす"
  ...
  className="inline-flex h-11 w-11 items-center justify-center border border-border text-lg transition-colors duration-200 hover:border-foreground/30 disabled:opacity-40 disabled:pointer-events-none"
>
  −
</button>
<input
  type="text"
  ...
  className="h-11 w-14 border border-border bg-transparent text-center text-sm focus-visible:border-accent focus-visible:outline-none"
/>
<button ...>+</button>  {/* 同じく h-11 w-11 */}
```

- [ ] **Step 8.6: time-slot-grid.tsx の min-h-10 → min-h-11**

```bash
grep -n "min-h-10" src/app/\(public\)/reservation/_components/time-slot-grid.tsx
```

該当行を `min-h-11` に置換。スケルトンも同サイズに合わせる。

- [ ] **Step 8.7: calendar-month-nav.tsx の h-10 → h-11**

```tsx
const CHEVRON_BUTTON_CLASS =
  "inline-flex h-11 w-11 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// 「今月」ボタン
<button
  type="button"
  onClick={onToday}
  className="inline-flex h-11 items-center border border-border px-4 text-xs tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
  今月
</button>;
```

- [ ] **Step 8.8: month-picker.tsx の年送り h-8 w-8 → h-11 w-11**

```bash
grep -n "h-8 w-8" src/app/\(public\)/events/_components/month-picker.tsx
```

line 120, 159 周辺の前年/翌年ボタンを `h-11 w-11` に統一。

- [ ] **Step 8.9: 検証**

```bash
bun run type-check 2>&1 | tail -10
bun run lint 2>&1 | tail -20
```

Expected: 0 errors / 0 new warnings。

- [ ] **Step 8.10: commit**

```bash
git add src/app/\(public\)/_shared/components/layouts/site-header.tsx \
        src/app/\(public\)/_shared/components/ui/share-buttons.tsx \
        src/app/\(public\)/_shared/components/sidebar/sidebar-custom.tsx \
        src/app/\(public\)/spaces/_components/image-carousel.tsx \
        src/app/\(public\)/reservation/_components/guest-stepper.tsx \
        src/app/\(public\)/reservation/_components/time-slot-grid.tsx \
        src/app/\(public\)/events/_components/calendar-month-nav.tsx \
        src/app/\(public\)/events/_components/month-picker.tsx
git commit -m "$(cat <<'EOF'
fix(a11y): meet 44px touch target across public interactive elements

- site-header hamburger/close: h-10 → h-11
- share-buttons: min-h-10 → min-h-11
- sidebar-custom CTA: inline-block py-2 → inline-flex min-h-11
- image-carousel nav arrows + dots: 32px → 44px, dots role="tab" →
  role="button" aria-current (WAI-ARIA APG: role="tab" requires tablist
  + tabpanel pair)
- guest-stepper +/- buttons + input: h-10 → h-11
- time-slot-grid: min-h-10 → min-h-11
- calendar-month-nav chevrons + today button: h-10 → h-11
- month-picker year nav: h-8 w-8 → h-11 w-11

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: ImageGallery Lightbox を Radix Dialog 移行

**Files:**

- Modify: `src/app/(public)/_shared/components/ui/image-gallery.tsx`

- [ ] **Step 9.1: 全面書き換え**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ImageFrame } from "../design-system/image-frame";

interface ImageGalleryProps {
  readonly images: readonly string[];
  readonly alt: string;
}

export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isOpen = lightboxIndex !== null;

  if (images.length === 0) return null;

  const thumbnails = images.slice(1, 5);

  function openLightbox(index: number) {
    setLightboxIndex(index);
  }

  function closeLightbox() {
    setLightboxIndex(null);
  }

  function goNext() {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + 1) % images.length);
  }

  function goPrev() {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft") goPrev();
  }

  const currentImage =
    lightboxIndex !== null ? images[lightboxIndex] : undefined;
  const hasMultiple = images.length > 1;

  return (
    <div>
      {/* Main image */}
      <button
        type="button"
        onClick={() => openLightbox(0)}
        className="block w-full"
        aria-label={`${alt} 1 を拡大表示`}
      >
        <ImageFrame
          src={images[0] ?? ""}
          alt={`${alt} 1`}
          fill
          aspect="photo"
          sizes="(min-width: 1280px) 860px, (min-width: 1024px) 60vw, 100vw"
          priority
        />
      </button>

      {/* Thumbnail strip */}
      {thumbnails.length > 0 ? (
        <div className="mt-3 flex gap-2">
          {thumbnails.map((src, i) => (
            <button
              key={`${src}-${String(i)}`}
              type="button"
              onClick={() => openLightbox(i + 1)}
              className="block shrink-0"
              aria-label={`${alt} ${String(i + 2)} を拡大表示`}
            >
              <ImageFrame
                src={src}
                alt={`${alt} ${String(i + 2)}`}
                fill
                className="h-16 w-24 sm:h-20 sm:w-28"
                sizes="112px"
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* Lightbox — Radix Dialog: focus trap + Escape + focus 復帰 自動 */}
      <Dialog.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) closeLightbox();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            onKeyDown={handleKeyDown}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <Dialog.Title className="sr-only">画像ギャラリー</Dialog.Title>
            <Dialog.Description className="sr-only">
              {alt}（{(lightboxIndex ?? 0) + 1} / {images.length}）。
              矢印キーで前後移動、Escape で閉じる。
            </Dialog.Description>
            {currentImage ? (
              <div className="relative max-h-[var(--lightbox-max-height)] max-w-[var(--lightbox-max-width)]">
                <Image
                  src={currentImage}
                  alt={`${alt} ${String((lightboxIndex ?? 0) + 1)}`}
                  width={1200}
                  height={800}
                  className="max-h-[var(--lightbox-max-height)] w-auto object-contain"
                />
              </div>
            ) : null}
            <Dialog.Close
              className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/80 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="閉じる"
            >
              <IconX className="h-6 w-6" aria-hidden="true" />
            </Dialog.Close>
            {hasMultiple ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="前の画像"
                >
                  <IconChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="次の画像"
                >
                  <IconChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
```

**変更点:**

- 自前 `LightboxOverlay` 削除（手動 focus trap / `useEffect` body lock / `useRef` 全廃）
- Radix Dialog に統一: focus trap / Escape / `aria-labelledby` / focus 復帰 / body scroll lock がすべて自動
- `Dialog.Title` + `Dialog.Description` を `sr-only` で配置（aria 紐づけは Radix が自動）
- close / prev / next ボタンを 44px (`h-11 w-11`) に統一
- thumbnail / main image button に `aria-label` 追加（拡大表示の意図を明示）
- KeyDown は `Escape` を Radix に委譲、矢印キーのみ自前

- [ ] **Step 9.2: 検証 + commit**

```bash
bun run type-check 2>&1 | tail -10
bun run lint src/app/\(public\)/_shared/components/ui/image-gallery.tsx 2>&1 | tail -10
git add src/app/\(public\)/_shared/components/ui/image-gallery.tsx
git commit -m "$(cat <<'EOF'
refactor(public/lightbox)!: migrate ImageGallery to Radix Dialog

BREAKING CHANGE: ImageGallery's hand-rolled LightboxOverlay (manual focus
trap, useEffect body lock, useRef-based Tab handling) is removed. Radix
Dialog now provides focus trap, Escape, body scroll lock, focus return on
close, and aria-labelledby/describedby wiring. Close/prev/next buttons
upgraded from 32px to 44px (WCAG 2.5.5 Enhanced).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 最終検証

- [ ] **Step 10.1: フル検証**

```bash
bun run validate > /tmp/validate-final.log 2>&1; echo "EXIT=$?"; tail -50 /tmp/validate-final.log
bun run build > /tmp/build-final.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/build-final.log
```

Expected: `validate` EXIT=0、`build` EXIT=0（pre-existing test failure を除く）。

- [ ] **Step 10.2: a11y 違反パターン残存ゼロ確認 grep**

```bash
# 公開ページに min-h-10 / h-10 / h-8 w-8 の interactive 要素が残っていないか
grep -rnE "(min-h-10|h-10 w-10|h-8 w-8)" src/app/\(public\)/ --include="*.tsx" \
  | grep -vE "(input|hero-demo|spaces-design-demo)" \
  || echo "OK: no public 44px-violations"

# 管理 table に裸 <input type="checkbox"> が残っていないか
grep -rnE 'input\s+type="checkbox"' src/app/\(admin\)/admin/\(dashboard\)/{posts,reservations,pages,faq}/ \
  || echo "OK: no naked checkbox in admin tables"

# PublishSwitch 呼び出しに resourceLabel が必ず含まれるか
grep -rln "<PublishSwitch" src/app/\(admin\)/ | while read f; do
  grep -A6 "<PublishSwitch" "$f" | grep -q "resourceLabel" || echo "MISSING: $f"
done
```

Expected: 全コマンドで「OK: ...」または empty / no MISSING。

- [ ] **Step 10.3: dev server で目視確認**

```
manual checklist:
1. /admin/posts のテーブルで checkbox を tab navigate → 全選択+各行 checkbox が 44px ヒットエリア
2. /admin/posts のソート列をクリック → SR で「タイトル（昇順）」「タイトル（降順）」が読まれる
3. NotificationBell を開く → SR で「通知（未読 N 件）」が 1 度だけ読まれる
4. /admin/posts でチェックボックスを切替 → SR で件数変更が polite で通知される
5. PublishSwitch を切替 → SR で「{title} の公開状態（現在: 公開中 / 非公開）」が読まれる
6. /spaces/[slug] の画像をクリック → Lightbox が開き Escape で閉じてトリガーに focus 復帰
7. /spaces 一覧の image-carousel ドットを tab navigate → 「画像 N 枚目を表示」が 44px ヒットエリアで読まれる
8. /reservation の guest-stepper +/- が 44px、time-slot grid が 44px、calendar の前/次月が 44px
9. /events のカレンダーで前月/翌月/今月が 44px、年送りが 44px
```

- [ ] **Step 10.4: PR 作成（手動）**

```bash
git log --oneline -10
echo "Plan complete. Ready for PR or merge."
```

---

## Self-Review Checklist

- [ ] **Spec coverage**: 横断 #1（タッチターゲット）/ #2（ARIA）/ Lightbox 移行 が Task 2-9 で全て実装される
- [ ] **Placeholder 検証**: 全 task に実コード + 実 commit メッセージ。`TODO` / `implement later` ゼロ
- [ ] **Type consistency**: `CheckboxCell` の prop 名 (`checked` / `onChange` / `aria-label` / `disabled` / `indeterminate`) が Task 3 の consumer 側 usage と一致。`PublishSwitch.resourceLabel` の名前が Task 5 全体で統一
- [ ] **後方互換**: Task 5（PublishSwitch）と Task 9（Lightbox）が BREAKING CHANGE。consumer 側を同 commit で全て更新するため main は常に green
- [ ] **CLAUDE.md ハードルール準拠**: hardcoded カラー / `as` キャスト / `useCallback`-禁止例外 すべて違反なし。`cn()` 使用、SSoT （`PUBLISH_LABELS` 等）参照維持

---

## Execution Notes

**推奨実行モード**: subagent-driven-development（fresh subagent per task + 二段レビュー）

**implementer dispatch 時の必須プロンプト要素**（CLAUDE.md §Subagent 規律）:

- 🚫 `git add / commit / push / reset / checkout / restore / stash` 全面禁止（controller が staging + commit）
- 「plan に記載の identifier と実装が乖離している場合は justified deviation として保持し報告」
- 「JSDoc / コメントに 'Phase X.Y' / 'refactor from Y' 等のタスク参照を含めない」
- model: sonnet 以上（haiku 禁止）

**並列化候補**: Task 4（SortableColumnHeader）/ Task 6（BulkActions）/ Task 7（NotificationBell + Pagination）は互いに独立 → 1 implementer に bundle 可能。Task 5（PublishSwitch）は consumer 数が多いため単独 dispatch 推奨。
