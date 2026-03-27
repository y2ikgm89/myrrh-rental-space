# 予約ページ日時選択 UI 完全刷新 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予約ページの日時選択を react-day-picker カレンダー + タイムスロットグリッド + Duration pill に刷新し、2ステップ・アダプティブレイアウトに再構築する

**Architecture:** react-day-picker v9 でカレンダー、カスタムコンポーネントで時間選択。既存の `getAvailableTimeSlots()` を Server Action 経由で呼び出し。react-hook-form でフォーム状態管理。2カラム（デスクトップ）/ スタック + Sticky CTA（モバイル）のアダプティブレイアウト。

**Tech Stack:** react-day-picker v9, date-fns v4 (既存), react-hook-form (既存), Tailwind CSS 4, Next.js 16 Server Actions

**Spec:** `docs/superpowers/specs/2026-03-23-reservation-booking-redesign.md`

---

### Task 1: react-day-picker v9 インストール + time-slots.ts 30分刻み対応

**Files:**

- Modify: `package.json` — `react-day-picker` 追加
- Modify: `src/shared/lib/reservation/time-slots.ts` — 30分刻み対応
- Test: `__tests__/unit/reservation/time-slots.test.ts`

- [ ] **Step 1: react-day-picker をインストール**

```bash
bun add react-day-picker
```

- [ ] **Step 2: time-slots.ts の30分刻みテストを書く**

`__tests__/unit/reservation/time-slots.test.ts` に以下を追加:

```typescript
import { describe, test, expect } from "bun:test";
import { generateSlotsFromBusinessHours } from "@/shared/lib/reservation/time-slots";

describe("generateSlotsFromBusinessHours - 30分刻み", () => {
  const businessHours = {
    monday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    tuesday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    wednesday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    thursday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    friday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    saturday: { isOpen: false, slots: [] },
    sunday: { isOpen: false, slots: [] },
  };

  test("30分刻みでスロットを生成する", () => {
    // 2026-03-23 は月曜日
    const slots = generateSlotsFromBusinessHours(businessHours, "2026-03-23");
    expect(slots.map((s) => s.time)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  test("休業日は空配列を返す", () => {
    // 2026-03-28 は土曜日
    const slots = generateSlotsFromBusinessHours(businessHours, "2026-03-28");
    expect(slots).toEqual([]);
  });

  test("複数営業時間帯（昼休みあり）を正しく処理する", () => {
    const lunchBreakHours = {
      ...businessHours,
      monday: {
        isOpen: true,
        slots: [
          { openTime: "09:00", closeTime: "12:00" },
          { openTime: "13:00", closeTime: "17:00" },
        ],
      },
    };
    const slots = generateSlotsFromBusinessHours(lunchBreakHours, "2026-03-23");
    const times = slots.map((s) => s.time);
    expect(times).toContain("09:00");
    expect(times).toContain("11:30");
    expect(times).not.toContain("12:00");
    expect(times).not.toContain("12:30");
    expect(times).toContain("13:00");
    expect(times).toContain("16:30");
  });
});
```

- [ ] **Step 3: テスト実行 → 失敗を確認**

```bash
bun run test __tests__/unit/reservation/time-slots.test.ts
```

Expected: FAIL — 現行は1時間刻みのため `"09:30"` が含まれない

- [ ] **Step 4: time-slots.ts を30分刻みに修正**

`src/shared/lib/reservation/time-slots.ts` の `generateSlotsFromBusinessHours` を修正:

```typescript
const SLOT_INTERVAL_MINUTES = 30;

export function generateSlotsFromBusinessHours(
  businessHours: BusinessHours | null,
  date: string,
): TimeSlot[] {
  const targetDate = new Date(`${date}T00:00:00`);
  const weekday = getWeekdayKey(targetDate);

  if (!businessHours) {
    return generateFallbackSlots();
  }

  const daySettings = businessHours[weekday];
  if (!daySettings.isOpen || daySettings.slots.length === 0) {
    return [];
  }

  const slots: TimeSlot[] = [];

  for (const timeSlot of daySettings.slots) {
    const start = parseTime(timeSlot.openTime);
    const end = parseTime(timeSlot.closeTime);
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;

    for (let m = startMinutes; m < endMinutes; m += SLOT_INTERVAL_MINUTES) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      slots.push({
        time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
        available: true,
      });
    }
  }

  const uniqueSlots = Array.from(
    new Map(slots.map((s) => [s.time, s])).values(),
  ).sort((a, b) => a.time.localeCompare(b.time));

  return uniqueSlots;
}
```

`generateFallbackSlots` も同様に30分刻みに修正:

```typescript
export function generateFallbackSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const startMinutes = DEFAULT_BUSINESS_HOURS.start * 60;
  const endMinutes = DEFAULT_BUSINESS_HOURS.end * 60;

  for (let m = startMinutes; m < endMinutes; m += SLOT_INTERVAL_MINUTES) {
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    slots.push({
      time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
      available: true,
    });
  }
  return slots;
}
```

`getAvailableTimeSlots` の予約済み判定も30分刻み対応:

```typescript
// 予約済みの時間枠を unavailable にマーク
for (const reservation of reservations) {
  const resStartMinutes =
    reservation.startTime.getHours() * 60 + reservation.startTime.getMinutes();
  const resEndMinutes =
    reservation.endTime.getHours() * 60 + reservation.endTime.getMinutes();

  for (const slot of slots) {
    const [h, m] = slot.time.split(":").map(Number);
    const slotMinutes = (h ?? 0) * 60 + (m ?? 0);
    if (slotMinutes >= resStartMinutes && slotMinutes < resEndMinutes) {
      slot.available = false;
    }
  }
}

// 今日の場合
if (date === today) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (const slot of slots) {
    const [h, m] = slot.time.split(":").map(Number);
    const slotMinutes = (h ?? 0) * 60 + (m ?? 0);
    if (slotMinutes < currentMinutes) {
      slot.available = false;
    }
  }
}
```

- [ ] **Step 5: テスト実行 → パスを確認**

```bash
bun run test __tests__/unit/reservation/time-slots.test.ts
```

Expected: PASS

- [ ] **Step 6: 既存テストが壊れていないか確認**

```bash
bun run test:unit
```

- [ ] **Step 7: コミット**

```bash
git add package.json bun.lock src/shared/lib/reservation/time-slots.ts __tests__/unit/reservation/time-slots.test.ts
git commit -m "feat: add react-day-picker v9 and update time slots to 30-min intervals"
```

---

### Task 2: 空き状況取得 Server Action

**Files:**

- Create: `src/app/(public)/_shared/actions/availability.ts`
- Test: `__tests__/unit/reservation/availability-action.test.ts` (型チェックのみ — Server Action はDB依存)

- [ ] **Step 1: Server Action を作成**

`src/app/(public)/_shared/actions/availability.ts`:

```typescript
"use server";

import type { TimeSlot } from "@/shared/lib/reservation/types";
import type { BusinessHours } from "@/shared/lib/json-validators";
import {
  getAvailableTimeSlots,
  getBusinessHoursSettings,
} from "@/shared/lib/reservation/time-slots";

export async function fetchAvailableSlots(
  spaceId: string,
  date: string,
): Promise<TimeSlot[]> {
  if (!spaceId || !date) return [];

  // 簡易バリデーション
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  return getAvailableTimeSlots(spaceId, date);
}

export async function fetchBusinessHours(): Promise<BusinessHours | null> {
  return getBusinessHoursSettings();
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/actions/availability.ts'
git commit -m "feat: add availability Server Actions for public reservation"
```

---

### Task 3: SpaceSelector コンポーネント

**Files:**

- Create: `src/app/(public)/reservation/_components/space-selector.tsx`

- [ ] **Step 1: SpaceSelector を作成**

```typescript
"use client";

import type { ReactElement } from "react";
import { ImageFrame } from "@/public/components/design-system/image-frame";

export type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string | null;
};

export function SpaceSelector({
  spaces,
  selectedId,
  onSelect,
}: {
  readonly spaces: readonly SpaceOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  // スペースが1つの場合は自動選択（UIは表示するが選択不可）
  const isSingle = spaces.length === 1;

  return (
    <div
      role="radiogroup"
      aria-label="スペースを選択"
      className={
        spaces.length <= 3
          ? "grid gap-3 md:grid-cols-3"
          : "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:overflow-visible md:snap-none md:pb-0"
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
            className={`flex min-w-[200px] snap-start flex-col items-start rounded-lg border p-3 text-left transition-all
              ${isSelected
                ? "border-accent ring-2 ring-accent/20 bg-accent/5"
                : "border-border bg-card hover:border-accent/40"
              }
              ${isSingle ? "cursor-default" : "cursor-pointer"}
              md:min-w-0`}
          >
            {space.mainImageUrl ? (
              <ImageFrame
                src={space.mainImageUrl}
                alt={space.name}
                width={200}
                height={133}
                aspectRatio="3/2"
                className="mb-2 w-full rounded"
              />
            ) : null}
            <span className="font-heading text-sm font-medium tracking-tight">
              {space.name}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              定員{space.capacity}名
            </span>
            <span className="mt-0.5 font-heading text-sm text-accent">
              &yen;{space.hourlyPrice.toLocaleString()}/時間
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/space-selector.tsx'
git commit -m "feat: add SpaceSelector card-based component"
```

---

### Task 4: CalendarPicker コンポーネント

**Files:**

- Create: `src/app/(public)/reservation/_components/calendar-picker.tsx`

- [ ] **Step 1: CalendarPicker を作成**

react-day-picker v9 をラップ。日本語ロケール、休業日 disabled、デザイントークン準拠。

```typescript
"use client";

import { useState, type ReactElement } from "react";
import { DayPicker } from "react-day-picker";
import { ja } from "react-day-picker/locale";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { getWeekdayKey } from "@/shared/lib/reservation/time-slots";

interface CalendarPickerProps {
  readonly selectedDate: Date | undefined;
  readonly onSelect: (date: Date | undefined) => void;
  readonly businessHours: BusinessHours | null;
}

export function CalendarPicker({
  selectedDate,
  onSelect,
  businessHours,
}: CalendarPickerProps): ReactElement {
  const [minDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const isDisabledDay = (date: Date): boolean => {
    // 過去の日付
    if (date < minDate) return true;

    // 営業時間設定がない場合は全日有効
    if (!businessHours) return false;

    // 休業日チェック
    const weekday = getWeekdayKey(date);
    const daySettings = businessHours[weekday];
    return !daySettings.isOpen || daySettings.slots.length === 0;
  };

  return (
    <DayPicker
      mode="single"
      locale={ja}
      selected={selectedDate}
      onSelect={onSelect}
      disabled={isDisabledDay}
      showOutsideDays={false}
      classNames={{
        root: "w-full",
        months: "w-full",
        month: "w-full",
        month_caption: "flex justify-center items-center py-2",
        caption_label: "font-heading text-base font-medium tracking-tight",
        nav: "flex items-center justify-between absolute inset-x-0 top-0 px-2 py-2",
        button_previous: "min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-surface transition-colors text-muted-foreground hover:text-foreground",
        button_next: "min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-surface transition-colors text-muted-foreground hover:text-foreground",
        weekdays: "grid grid-cols-7 mb-1",
        weekday: "text-center text-xs font-medium text-muted-foreground py-2",
        weeks: "w-full",
        week: "grid grid-cols-7",
        day: "relative text-center",
        day_button: "min-h-11 md:min-h-10 w-full rounded-lg text-sm font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        selected: "!bg-accent !text-accent-foreground hover:!bg-accent/90",
        disabled: "text-muted-foreground/40 pointer-events-none line-through",
        today: "font-bold text-accent",
        outside: "text-muted-foreground/30",
      }}
    />
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/calendar-picker.tsx'
git commit -m "feat: add CalendarPicker with react-day-picker v9"
```

---

### Task 5: TimeSlotGrid コンポーネント

**Files:**

- Create: `src/app/(public)/reservation/_components/time-slot-grid.tsx`

- [ ] **Step 1: TimeSlotGrid を作成**

```typescript
"use client";

import type { ReactElement } from "react";
import type { TimeSlot } from "@/shared/lib/reservation/types";

interface TimeSlotGridProps {
  readonly slots: readonly TimeSlot[];
  readonly selectedTime: string | null;
  readonly onSelect: (time: string) => void;
  readonly isLoading: boolean;
}

export function TimeSlotGrid({
  slots,
  selectedTime,
  onSelect,
  isLoading,
}: TimeSlotGridProps): ReactElement {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 md:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="min-h-11 animate-pulse rounded-lg bg-surface"
          />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        この日は予約できる時間帯がありません
      </p>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="開始時間を選択"
      className="grid grid-cols-3 gap-2 md:grid-cols-4"
    >
      {slots.map((slot) => {
        const isSelected = slot.time === selectedTime;
        const isUnavailable = !slot.available;

        return (
          <button
            key={slot.time}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-disabled={isUnavailable}
            disabled={isUnavailable}
            onClick={() => onSelect(slot.time)}
            className={`min-h-11 rounded-lg border text-sm font-medium transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
              ${isSelected
                ? "border-accent bg-accent/10 text-accent ring-1 ring-accent/30"
                : isUnavailable
                  ? "border-border/50 bg-surface/50 text-muted-foreground/40 line-through cursor-not-allowed"
                  : "border-border bg-card text-foreground hover:border-accent/40 hover:bg-surface cursor-pointer"
              }`}
          >
            {slot.time}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/time-slot-grid.tsx'
git commit -m "feat: add TimeSlotGrid component"
```

---

### Task 6: DurationPills + GuestStepper + BookingSummary

**Files:**

- Create: `src/app/(public)/reservation/_components/duration-pills.tsx`
- Create: `src/app/(public)/reservation/_components/guest-stepper.tsx`
- Create: `src/app/(public)/reservation/_components/booking-summary.tsx`

- [ ] **Step 1: DurationPills を作成**

`src/app/(public)/reservation/_components/duration-pills.tsx`:

```typescript
"use client";

import type { ReactElement } from "react";

/** Duration options in minutes */
const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240, 300, 360] as const;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}.${(m / 60) * 10}時間`;
}

interface DurationPillsProps {
  readonly selectedMinutes: number | null;
  readonly onSelect: (minutes: number) => void;
  /** Maximum available duration from selected start time (in minutes) */
  readonly maxMinutes: number;
}

export function DurationPills({
  selectedMinutes,
  onSelect,
  maxMinutes,
}: DurationPillsProps): ReactElement {
  const availableOptions = DURATION_OPTIONS.filter((d) => d <= maxMinutes);

  if (availableOptions.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        選択可能な利用時間がありません
      </p>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="利用時間を選択"
      className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0"
    >
      {availableOptions.map((minutes) => {
        const isSelected = minutes === selectedMinutes;
        return (
          <button
            key={minutes}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(minutes)}
            className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
              ${isSelected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card text-foreground hover:border-accent/40"
              }`}
          >
            {formatDuration(minutes)}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: GuestStepper を作成**

`src/app/(public)/reservation/_components/guest-stepper.tsx`:

```typescript
"use client";

import type { ReactElement } from "react";

interface GuestStepperProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max: number;
}

export function GuestStepper({
  value,
  onChange,
  min = 1,
  max,
}: GuestStepperProps): ReactElement {
  return (
    <div className="flex items-center gap-1">
      <label className="mr-3 text-sm font-medium text-foreground">
        利用人数
      </label>
      <button
        type="button"
        aria-label="利用人数を減らす"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border
          text-lg font-medium transition-colors hover:bg-surface
          disabled:opacity-40 disabled:pointer-events-none"
      >
        −
      </button>
      <span
        aria-live="polite"
        className="min-w-12 text-center font-heading text-lg"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="利用人数を増やす"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border
          text-lg font-medium transition-colors hover:bg-surface
          disabled:opacity-40 disabled:pointer-events-none"
      >
        +
      </button>
      <span className="ml-1 text-sm text-muted-foreground">名</span>
    </div>
  );
}
```

- [ ] **Step 3: BookingSummary を作成**

`src/app/(public)/reservation/_components/booking-summary.tsx`:

```typescript
"use client";

import type { ReactElement } from "react";

interface BookingSummaryProps {
  readonly spaceName: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly guests: number;
  readonly price: number | null;
  /** 変更ボタンの表示（Step 2 で使用） */
  readonly onEdit?: () => void;
}

function formatDateJa(dateStr: string): string {
  try {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return dateStr;
  }
}

function formatDurationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  const endMin = (eh ?? 0) * 60 + (em ?? 0);
  const diff = endMin - startMin;
  if (diff < 60) return `${diff}分`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function BookingSummary({
  spaceName,
  date,
  startTime,
  endTime,
  guests,
  price,
  onEdit,
}: BookingSummaryProps): ReactElement {
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-heading text-sm font-medium tracking-tight">
            {spaceName}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDateJa(date)} {startTime} → {endTime}（{formatDurationLabel(startTime, endTime)}）
          </p>
          <p className="text-sm text-muted-foreground">{guests}名</p>
        </div>
        <div className="text-right">
          {price !== null ? (
            <p className="font-heading text-lg text-accent">
              &yen;{price.toLocaleString()}
            </p>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="mt-1 text-xs text-accent underline underline-offset-2 hover:text-accent/80"
            >
              変更する
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/reservation/_components/duration-pills.tsx' 'src/app/(public)/reservation/_components/guest-stepper.tsx' 'src/app/(public)/reservation/_components/booking-summary.tsx'
git commit -m "feat: add DurationPills, GuestStepper, and BookingSummary"
```

---

### Task 7: StickyBottomBar コンポーネント

**Files:**

- Create: `src/app/(public)/reservation/_components/sticky-bottom-bar.tsx`

- [ ] **Step 1: StickyBottomBar を作成**

```typescript
"use client";

import type { ReactNode, ReactElement } from "react";

interface StickyBottomBarProps {
  readonly children: ReactNode;
  /** デスクトップでは非表示 (md:hidden) */
  readonly mobileOnly?: boolean;
}

export function StickyBottomBar({
  children,
  mobileOnly = true,
}: StickyBottomBarProps): ReactElement {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border
        bg-background/95 backdrop-blur-sm
        px-[var(--container-padding)] pb-[env(safe-area-inset-bottom)] pt-3
        ${mobileOnly ? "md:hidden" : ""}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック + コミット**

```bash
bun run type-check
git add 'src/app/(public)/reservation/_components/sticky-bottom-bar.tsx'
git commit -m "feat: add StickyBottomBar for mobile reservation CTA"
```

---

### Task 8: ReservationForm 全面書換 + CustomerStep 統合

**Files:**

- Rewrite: `src/app/(public)/reservation/_components/reservation-form.tsx`
- Rewrite: `src/app/(public)/reservation/_components/customer-step.tsx`
- Delete: `src/app/(public)/reservation/_components/date-time-step.tsx`
- Delete: `src/app/(public)/reservation/_components/confirmation-step.tsx`

これが最大のタスク。以下のサブステップに分割:

- [ ] **Step 1: date-time-step.tsx と confirmation-step.tsx を削除**

```bash
git rm 'src/app/(public)/reservation/_components/date-time-step.tsx' 'src/app/(public)/reservation/_components/confirmation-step.tsx'
```

- [ ] **Step 2: reservation-form.tsx を全面書換**

新しい ReservationForm は:

- 2ステップ（日時選択 → 顧客情報+確認）
- アダプティブレイアウト（デスクトップ 2カラム / モバイル スタック）
- Server Action で空き状況をフェッチ
- startTime + duration → endTime 変換

`src/app/(public)/reservation/_components/reservation-form.tsx`:

```typescript
"use client";

import { useState, useTransition, useRef, type ReactElement } from "react";
import { useWatch } from "react-hook-form";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
import { submitReservation } from "@/public/actions/reservation";
import { fetchAvailableSlots } from "@/public/actions/availability";
import { isMutationError } from "@/shared/lib/mutation-result";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
import { SpaceSelector, type SpaceOption } from "./space-selector";
import { CalendarPicker } from "./calendar-picker";
import { TimeSlotGrid } from "./time-slot-grid";
import { DurationPills } from "./duration-pills";
import { GuestStepper } from "./guest-stepper";
import { BookingSummary } from "./booking-summary";
import { StickyBottomBar } from "./sticky-bottom-bar";
import { CustomerStep } from "./customer-step";

export function ReservationForm({
  spaces,
  businessHours,
}: {
  readonly spaces: readonly SpaceOption[];
  readonly businessHours: BusinessHours | null;
}): ReactElement {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Availability state
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isFetchingSlots, startFetchTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const timeGridRef = useRef<HTMLDivElement>(null);

  const { form, isPending, onSubmit } = usePublicForm(
    publicReservationSchema,
    async (data) => {
      setErrorMessage(null);
      const result = await submitReservation(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setSubmitted(true);
      }
      return result;
    },
  );

  const spaceId = useWatch({ control: form.control, name: "spaceId" });
  const selectedSpace = spaces.find((s) => s.id === spaceId);

  // --- Derived values ---

  const endTime = (() => {
    if (!selectedStartTime || !selectedDuration) return null;
    const [h, m] = selectedStartTime.split(":").map(Number);
    const totalMinutes = ((h ?? 0) * 60 + (m ?? 0)) + selectedDuration;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
  })();

  const maxDuration = (() => {
    if (!selectedStartTime || slots.length === 0) return 0;
    const startIdx = slots.findIndex((s) => s.time === selectedStartTime);
    if (startIdx === -1) return 0;
    let count = 0;
    for (let i = startIdx + 1; i < slots.length; i++) {
      if (!slots[i]?.available) break;
      count++;
    }
    // +1 to include the selected slot itself as the minimum duration
    return (count + 1) * 30;
  })();

  const price = (() => {
    if (!selectedSpace || !selectedDuration) return null;
    const hours = selectedDuration / 60;
    return Math.floor(selectedSpace.hourlyPrice * hours);
  })();

  const isStep1Complete =
    !!spaceId && !!selectedDate && !!selectedStartTime && !!selectedDuration && !!endTime;

  // --- Handlers ---

  const handleSpaceSelect = (id: string) => {
    form.setValue("spaceId", id);
    // Reset time selection when space changes
    setSelectedStartTime(null);
    setSelectedDuration(null);
    if (selectedDate) {
      fetchSlotsForDate(id, selectedDate);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedStartTime(null);
    setSelectedDuration(null);

    if (date && spaceId) {
      const dateStr = formatDateToISO(date);
      form.setValue("date", dateStr);
      fetchSlotsForDate(spaceId, date);
    }
  };

  const fetchSlotsForDate = (sid: string, date: Date) => {
    const dateStr = formatDateToISO(date);
    startFetchTransition(async () => {
      const result = await fetchAvailableSlots(sid, dateStr);
      setSlots(result);
      // Scroll to time grid on mobile
      setTimeout(() => {
        timeGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    });
  };

  const handleStartTimeSelect = (time: string) => {
    setSelectedStartTime(time);
    setSelectedDuration(null);
    form.setValue("startTime", time);
  };

  const handleDurationSelect = (minutes: number) => {
    setSelectedDuration(minutes);
    // Calculate and set endTime
    if (selectedStartTime) {
      const [h, m] = selectedStartTime.split(":").map(Number);
      const totalMinutes = ((h ?? 0) * 60 + (m ?? 0)) + minutes;
      const endH = Math.floor(totalMinutes / 60);
      const endM = totalMinutes % 60;
      const computedEnd = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
      form.setValue("endTime", computedEnd);
    }
  };

  const handleGuestChange = (value: number) => {
    form.setValue("numberOfGuests", value);
  };

  const goToStep2 = async () => {
    const isValid = await form.trigger([
      "spaceId", "date", "startTime", "endTime", "numberOfGuests",
    ] as const);
    if (!isValid) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBackToStep1 = () => {
    setStep(1);
  };

  // Auto-select single space
  if (spaces.length === 1 && !spaceId) {
    const single = spaces[0];
    if (single) {
      form.setValue("spaceId", single.id);
    }
  }

  const numberOfGuests = useWatch({ control: form.control, name: "numberOfGuests" }) ?? 1;

  // --- Render ---

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="rounded-lg border border-accent/20 bg-surface p-8 text-center">
          <h2 className="font-heading text-xl tracking-tight">
            ご予約を受け付けました
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            予約内容を確認の上、担当者よりご連絡いたします。
            <br />
            確定後に確認メールをお送りします。
          </p>
        </div>
      </ScrollReveal>
    );
  }

  if (step === 2) {
    return (
      <form onSubmit={onSubmit}>
        <CustomerStep
          form={form}
          isPending={isPending}
          errorMessage={errorMessage}
          summary={{
            spaceName: selectedSpace?.name ?? "",
            date: form.getValues("date") ?? "",
            startTime: selectedStartTime ?? "",
            endTime: endTime ?? "",
            guests: numberOfGuests,
            price,
          }}
          onBack={goBackToStep1}
        />
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {/* Space selector */}
      <div className="mb-8">
        <SpaceSelector
          spaces={spaces}
          selectedId={spaceId ?? ""}
          onSelect={handleSpaceSelect}
        />
      </div>

      {/* 2-column layout on desktop */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Left: Calendar */}
        <div>
          <h2 className="mb-4 font-heading text-lg tracking-tight">
            日付を選択
          </h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <CalendarPicker
              selectedDate={selectedDate}
              onSelect={handleDateSelect}
              businessHours={businessHours}
            />
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-accent" />
              選択中
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full border border-border" />
              空きあり
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-muted-foreground/20" />
              休業日
            </span>
          </div>
        </div>

        {/* Right: Time selection + summary */}
        <div ref={timeGridRef}>
          {selectedDate ? (
            <>
              <h2 className="mb-4 font-heading text-lg tracking-tight">
                開始時間を選択
              </h2>
              <TimeSlotGrid
                slots={slots}
                selectedTime={selectedStartTime}
                onSelect={handleStartTimeSelect}
                isLoading={isFetchingSlots}
              />

              {selectedStartTime ? (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-foreground">
                    利用時間
                  </h3>
                  <DurationPills
                    selectedMinutes={selectedDuration}
                    onSelect={handleDurationSelect}
                    maxMinutes={maxDuration}
                  />
                </div>
              ) : null}

              {selectedDuration ? (
                <div className="mt-6">
                  <GuestStepper
                    value={numberOfGuests}
                    onChange={handleGuestChange}
                    max={selectedSpace?.capacity ?? 500}
                  />
                </div>
              ) : null}

              {/* Desktop summary + CTA */}
              {isStep1Complete ? (
                <div className="mt-6 hidden md:block">
                  <BookingSummary
                    spaceName={selectedSpace?.name ?? ""}
                    date={form.getValues("date") ?? ""}
                    startTime={selectedStartTime}
                    endTime={endTime ?? ""}
                    guests={numberOfGuests}
                    price={price}
                  />
                  <div className="mt-4">
                    <Button type="button" onClick={goToStep2}>
                      お客様情報の入力へ
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                日付を選択してください
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      {isStep1Complete ? (
        <StickyBottomBar>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">概算料金</p>
              <p className="font-heading text-lg text-accent">
                {price !== null ? `¥${price.toLocaleString()}` : "—"}
              </p>
            </div>
            <Button type="button" onClick={goToStep2}>
              情報入力へ →
            </Button>
          </div>
        </StickyBottomBar>
      ) : null}

      {/* Bottom padding for sticky bar on mobile */}
      {isStep1Complete ? <div className="h-20 md:hidden" /> : null}
    </form>
  );
}

function formatDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 3: customer-step.tsx を書換（サマリーカード統合 + 確認ステップ吸収）**

`src/app/(public)/reservation/_components/customer-step.tsx`:

```typescript
"use client";

import type { ReactElement } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Textarea } from "@/public/components/design-system/textarea";
import type { PublicReservationInput } from "@/shared/lib/validations/public-reservation";
import { BookingSummary } from "./booking-summary";
import { StickyBottomBar } from "./sticky-bottom-bar";

interface CustomerStepProps {
  readonly form: UseFormReturn<PublicReservationInput>;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly summary: {
    spaceName: string;
    date: string;
    startTime: string;
    endTime: string;
    guests: number;
    price: number | null;
  };
  readonly onBack: () => void;
}

export function CustomerStep({
  form,
  isPending,
  errorMessage,
  summary,
  onBack,
}: CustomerStepProps): ReactElement {
  return (
    <div>
      {/* Summary card */}
      <div className="mb-8">
        <BookingSummary
          spaceName={summary.spaceName}
          date={summary.date}
          startTime={summary.startTime}
          endTime={summary.endTime}
          guests={summary.guests}
          price={summary.price}
          onEdit={onBack}
        />
      </div>

      <h2 className="mb-6 font-heading text-xl tracking-tight md:text-2xl">
        お客様情報
      </h2>

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          id="reservation-lastname"
          label="姓"
          type="text"
          placeholder="山田"
          {...(form.formState.errors.lastName?.message && {
            error: form.formState.errors.lastName.message,
          })}
          {...form.register("lastName")}
        />
        <Input
          id="reservation-firstname"
          label="名"
          type="text"
          placeholder="太郎"
          {...(form.formState.errors.firstName?.message && {
            error: form.formState.errors.firstName.message,
          })}
          {...form.register("firstName")}
        />
      </div>

      <div className="mt-5">
        <Input
          id="reservation-email"
          label="メールアドレス"
          type="email"
          placeholder="mail@example.com"
          {...(form.formState.errors.email?.message && {
            error: form.formState.errors.email.message,
          })}
          {...form.register("email")}
        />
      </div>

      <div className="mt-5">
        <Input
          id="reservation-phone"
          label="電話番号（任意）"
          type="tel"
          placeholder="03-1234-5678"
          {...(form.formState.errors.phoneNumber?.message && {
            error: form.formState.errors.phoneNumber.message,
          })}
          {...form.register("phoneNumber")}
        />
      </div>

      <div className="mt-5">
        <Textarea
          id="reservation-notes"
          label="備考（任意）"
          rows={3}
          placeholder="ご要望などございましたらお書きください"
          {...(form.formState.errors.notes?.message && {
            error: form.formState.errors.notes.message,
          })}
          {...form.register("notes")}
        />
      </div>

      <div className="mt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border accent-accent"
            {...form.register("agreeToTerms")}
          />
          <span className="text-sm text-muted-foreground">
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              利用規約
            </a>
            に同意します
          </span>
        </label>
        {form.formState.errors.agreeToTerms?.message ? (
          <p className="mt-1 text-sm text-destructive">
            {form.formState.errors.agreeToTerms.message}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {/* Desktop buttons */}
      <div className="mt-8 hidden flex-col gap-3 sm:flex sm:flex-row sm:gap-4 md:flex">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isPending}
        >
          戻る
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "送信中..." : "予約を確定する"}
        </Button>
      </div>

      {/* Mobile sticky bottom */}
      <StickyBottomBar>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            disabled={isPending}
            className="flex-shrink-0"
          >
            戻る
          </Button>
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? "送信中..." : "予約を確定する"}
          </Button>
        </div>
      </StickyBottomBar>
      <div className="h-20 md:hidden" />
    </div>
  );
}
```

- [ ] **Step 4: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat!: rewrite ReservationForm with 2-step adaptive layout"
```

---

### Task 9: page.tsx 更新 + StepIndicator 2ステップ対応

**Files:**

- Modify: `src/app/(public)/reservation/page.tsx`
- Modify: `src/app/(public)/_shared/components/ui/step-indicator.tsx`

- [ ] **Step 1: page.tsx を更新**

Container variant を `default` に変更、営業時間データ取得を追加、`max-w-4xl` 内部制約:

```typescript
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultReservationContent } from "@/public/lib/content/defaults/reservation";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Container } from "@/public/components/design-system/container";
import { getPublishedSpaces } from "@/shared/domain/spaces/public-queries";
import { getBusinessHoursSettingsQuery } from "@/shared/domain/reservations/availability";
import { ReservationForm } from "./_components/reservation-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("reservation");
}

export default async function ReservationPage(): Promise<ReactElement> {
  await connection();

  const [content, allSpaces, businessHours] = await Promise.all([
    getPageContent(
      "reservation",
      simplePageContentSchema,
      defaultReservationContent,
    ),
    getPublishedSpaces(),
    getBusinessHoursSettingsQuery(),
  ]);

  const spaces = allSpaces.map((s) => ({
    id: s.id,
    name: s.name,
    capacity: s.capacity,
    hourlyPrice: s.hourlyPrice,
    mainImageUrl: s.mainImageUrl,
  }));

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container>
          <div className="mx-auto max-w-4xl">
            <ReservationForm spaces={spaces} businessHours={businessHours} />
          </div>
        </Container>
      </section>

      <SiteCTA heading="お問い合わせ" body="ご不明点はお気軽にご相談ください" />
    </>
  );
}
```

- [ ] **Step 2: StepIndicator を2ステップ対応に更新**

`step-indicator.tsx` の STEPS 定数を変更:

```typescript
const STEPS = [
  { number: 1, label: "日時選択" },
  { number: 2, label: "予約確定" },
] as const;
```

注: StepIndicator は reservation-form.tsx から使われなくなるが、他で使う可能性のため STEPS のみ修正。ReservationForm ではステップインジケーターを使わない設計（プログレッシブ出現で代替）。

実際には reservation-form.tsx で StepIndicator を使わないため、この変更はスキップ可能。

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/reservation/page.tsx'
git commit -m "feat: update reservation page with business hours data"
```

---

### Task 10: validate + build 検証

**Files:** なし（検証のみ）

- [ ] **Step 1: validate 実行**

```bash
bun run validate
```

- [ ] **Step 2: build 実行**

```bash
bun run build
```

- [ ] **Step 3: lint/型エラーがあれば修正してコミット**

---

### Task 11: Playwright で動作確認

**Files:** なし（手動確認）

- [ ] **Step 1: dev サーバー起動して `/reservation` を確認**

```bash
bun dev
```

Playwright MCP で動作確認:

1. `/reservation` にアクセス
2. スペースカード選択
3. カレンダーで日付選択
4. タイムスロットグリッドが出現
5. 開始時間選択 → Duration pill 出現
6. Duration 選択 → 人数 + サマリー表示
7. モバイルビューポート (375px) で Sticky bottom bar 確認
8. Step 2 への遷移
9. 顧客情報入力 → 送信

- [ ] **Step 2: 不具合があれば修正してコミット**

- [ ] **Step 3: 最終 validate + build**

```bash
bun run validate && bun run build
```
