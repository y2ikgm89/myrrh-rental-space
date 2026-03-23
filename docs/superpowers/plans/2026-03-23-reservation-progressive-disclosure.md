# 予約ページ プログレッシブ開示型リデザイン — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予約ページを Location → Space → 日時のプログレッシブ開示型 UI に刷新する

**Architecture:** Server Component で `LocationWithSpaces[]` を取得し、Client Component の `ReservationForm` が段階的に選択 UI を表示。`useState` を Single Source of Truth とし、`react-hook-form` に `setValue()` で一方向同期。

**Tech Stack:** Next.js 16 (`'use cache'`), React 19, TypeScript 6, Tailwind CSS 4, Zod 4, react-hook-form, react-day-picker v9

**Spec:** `docs/superpowers/specs/2026-03-23-reservation-progressive-disclosure-design.md`

---

## File Structure

### 新規作成

| ファイル                                                         | 責務                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/shared/domain/locations/public-queries.ts`                  | `getPublishedLocationsWithSpaces()` — `'use cache'` パターン準拠                     |
| `src/app/(public)/reservation/_components/location-selector.tsx` | Location カード選択 UI                                                               |
| `src/app/(public)/reservation/_components/date-time-section.tsx` | 日時選択統合ラッパー（CalendarPicker + TimeSlotGrid + DurationPills + GuestStepper） |

### 書き直し

| ファイル                                                        | 変更内容                           |
| --------------------------------------------------------------- | ---------------------------------- |
| `src/shared/lib/validations/public-reservation.ts`              | `locationId` フィールド追加        |
| `src/app/(public)/reservation/_components/space-selector.tsx`   | 画像付きカードに全面書き直し       |
| `src/app/(public)/reservation/_components/booking-summary.tsx`  | Location 名追加                    |
| `src/app/(public)/reservation/_components/reservation-form.tsx` | プログレッシブ開示型に全面書き直し |
| `src/app/(public)/reservation/page.tsx`                         | データ取得を Location ベースに変更 |

### 軽微な修正

| ファイル                                                     | 変更内容                        |
| ------------------------------------------------------------ | ------------------------------- |
| `src/app/(public)/reservation/_components/customer-step.tsx` | summary に locationName 追加    |
| `src/app/(public)/_shared/actions/reservation.ts`            | locationId バリデーション追加   |
| `src/app/(public)/_styles/public.css`                        | `@keyframes section-enter` 追加 |

### 変更なし

- `time-slot-grid.tsx`, `duration-pills.tsx`, `guest-stepper.tsx`, `sticky-bottom-bar.tsx`
- `calendar-picker.tsx`（spec では「props整理」だが、実際に CalendarPicker の interface は変更不要 — 呼び出し側の整理は DateTimeSection に吸収済み）
- `time-slots.ts`, `availability.ts`

### 注意: 実装時の制約

- **`useCallback`/`useMemo` 禁止**: React Compiler 1.0 が自動メモ化するため、プレーンな関数を使う
- **`as` / `!`（非null アサーション）禁止**: 条件分岐内のローカル変数で型を絞る
- **`usePublicForm` の呼び出し**: 3引数 `(schema, action, options?)` で返り値は `{ form, isPending, onSubmit }`
- **`addMinutesToTime`**: 現行は `reservation-form.tsx` 内のローカル関数。`time-slots-utils.ts` に export する
- **`DurationPills` の prop 名**: `selectedMinutes`（`selectedDuration` ではない）
- **`REDUCED_MOTION` の判定**: モジュールスコープの `typeof window` チェックは SSR で常に `false`。関数内で毎回判定する
- **Spec との差異**: `DateTimeSection` に `hourlyPrice` prop はスペックにあるが、コンポーネント内部で使用しないため省略。料金計算は親の `ReservationForm` で行う

---

## Task 1: バリデーションスキーマに `locationId` 追加

**Files:**

- Modify: `src/shared/lib/validations/public-reservation.ts`

- [ ] **Step 1: `locationId` フィールドを追加**

`spaceId` の直前に追加:

```typescript
// public-reservation.ts の .object() 内、先頭に追加
locationId: z.string().uuid({ error: "場所を選択してください" }),
```

変更後の `.object()` 冒頭:

```typescript
export const publicReservationSchema = z
  .object({
    locationId: z.string().uuid({ error: "場所を選択してください" }),
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    // ... 残りは変更なし
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: `PublicReservationInput` に `locationId` が自動追加される。既存の型参照箇所で `locationId` 不足エラーが出る（後続タスクで修正）

- [ ] **Step 3: コミット**

```bash
git add src/shared/lib/validations/public-reservation.ts
git commit -m "feat(reservation): add locationId to public reservation schema"
```

---

## Task 2: `addMinutesToTime` を `time-slots-utils.ts` に export

**Files:**

- Modify: `src/shared/lib/reservation/time-slots-utils.ts`

現在 `reservation-form.tsx` 内のローカル関数として定義されている `addMinutesToTime` を共有ユーティリティに移動する。

- [ ] **Step 1: 関数を追加**

`time-slots-utils.ts` の末尾に追加:

```typescript
/** 時刻文字列（HH:MM）に指定分数を加算して HH:MM を返す */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/shared/lib/reservation/time-slots-utils.ts
git commit -m "refactor(reservation): export addMinutesToTime from time-slots-utils"
```

---

## Task 3: `getPublishedLocationsWithSpaces()` クエリ新設

**Files:**

- Create: `src/shared/domain/locations/public-queries.ts`

**参照パターン:** `src/shared/domain/spaces/public-queries.ts`（`'use cache'` + `cacheTag` + `toPlainArray`）

- [ ] **Step 1: public-queries.ts を作成**

```typescript
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { toPlainArray } from "@/shared/lib/serialize";

export type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string;
};

export type LocationWithSpaces = {
  id: string;
  name: string;
  address: string;
  imageUrl: string;
  spaces: SpaceOption[];
};

/**
 * 公開済み Location と配下の公開済み Space を取得（予約フォーム用）
 */
export async function getPublishedLocationsWithSpaces(): Promise<
  LocationWithSpaces[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const locations = await prisma.location.findMany({
    where: { isPublished: true, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      imageUrl: true,
      spaces: {
        where: { isPublished: true, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          capacity: true,
          hourlyPrice: true,
          mainImageUrl: true,
        },
      },
    },
  });

  return toPlainArray(
    locations
      .filter((l) => l.spaces.length > 0)
      .map((l) => ({
        ...l,
        spaces: l.spaces.map((s) => ({
          ...s,
          hourlyPrice: Number(s.hourlyPrice),
        })),
      })),
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS（まだどこからも import されていない）

- [ ] **Step 3: コミット**

```bash
git add src/shared/domain/locations/public-queries.ts
git commit -m "feat(reservation): add getPublishedLocationsWithSpaces query"
```

---

## Task 3: CSS アニメーション追加

**Files:**

- Modify: `src/app/(public)/_styles/public.css`

- [ ] **Step 1: `@keyframes section-enter` を追加**

既存の `@keyframes` セクション（`maintenance-fade-in` 等の近く、`/* ─ Keyframes ─ */` コメントブロック内）に追加:

```css
@keyframes section-enter {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: ユーティリティクラスを追加**

`@utility` レイヤー内（既存の `.animate-maintenance-in` の近く）に追加:

```css
@utility animate-section-enter {
  animation: section-enter 0.3s ease-out both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_styles/public.css'
git commit -m "feat(reservation): add section-enter animation keyframes"
```

---

## Task 4: LocationSelector コンポーネント新規作成

**Files:**

- Create: `src/app/(public)/reservation/_components/location-selector.tsx`

- [ ] **Step 1: コンポーネント実装**

```typescript
"use client";

import type { ReactElement } from "react";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
import { ImageFrame } from "@/public/components/design-system/image-frame";

export function LocationSelector({
  locations,
  selectedId,
  onSelect,
}: {
  readonly locations: readonly LocationWithSpaces[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label="場所を選択"
      className="grid gap-4 md:grid-cols-2"
    >
      {locations.map((location) => {
        const isSelected = location.id === selectedId;
        return (
          <button
            key={location.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(location.id)}
            className={`flex gap-4 rounded-xl border p-3 text-left transition-all
              ${
                isSelected
                  ? "border-accent ring-2 ring-accent/20 bg-accent/5"
                  : "border-border bg-card hover:border-accent/40"
              }`}
          >
            <ImageFrame
              src={location.imageUrl}
              alt={location.name}
              width={160}
              height={90}
              aspect="video"
              sizes="160px"
              className="w-40 shrink-0"
            />
            <div className="flex min-w-0 flex-col justify-center">
              <span className="font-heading text-base font-medium tracking-tight">
                {location.name}
              </span>
              <span className="mt-1 truncate text-sm text-muted-foreground">
                {location.address}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/location-selector.tsx'
git commit -m "feat(reservation): add LocationSelector component"
```

---

## Task 5: SpaceSelector を画像付きカードに書き直し

**Files:**

- Rewrite: `src/app/(public)/reservation/_components/space-selector.tsx`

- [ ] **Step 1: 全面書き直し**

```typescript
"use client";

import type { ReactElement } from "react";
import type { SpaceOption } from "@/shared/domain/locations/public-queries";
import { ImageFrame } from "@/public/components/design-system/image-frame";

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

  return (
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
              className="w-full"
            />
            <div className="p-3">
              <span className="font-heading text-sm font-medium tracking-tight">
                {space.name}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                定員{space.capacity}名
              </span>
              <span className="mt-0.5 block font-heading text-sm text-accent">
                {YEN}{space.hourlyPrice.toLocaleString()}/時間
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS（旧 `SpaceOption` 型の export 参照が壊れる可能性あり → reservation-form.tsx で後続修正）

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/space-selector.tsx'
git commit -m "feat(reservation): rewrite SpaceSelector with image cards"
```

---

## Task 6: BookingSummary に Location 名追加

**Files:**

- Modify: `src/app/(public)/reservation/_components/booking-summary.tsx`

- [ ] **Step 1: `locationName` prop を追加**

interface に追加:

```typescript
interface BookingSummaryProps {
  readonly locationName: string; // 追加
  readonly spaceName: string;
  // ... 残りは同じ
}
```

表示部分（`<p className="font-heading ...">` 内）を変更:

```typescript
<p className="font-heading text-sm font-medium tracking-tight">
  {locationName} &rsaquo; {spaceName}
</p>
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: `BookingSummary` を使用する箇所（customer-step.tsx, reservation-form.tsx）で `locationName` 不足エラー → 後続タスクで修正

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/booking-summary.tsx'
git commit -m "feat(reservation): add locationName to BookingSummary"
```

---

## Task 7: CustomerStep に locationName 追加

**Files:**

- Modify: `src/app/(public)/reservation/_components/customer-step.tsx`

- [ ] **Step 1: summary 型に `locationName` 追加**

```typescript
interface CustomerStepProps {
  // ...
  readonly summary: {
    locationName: string; // 追加
    spaceName: string;
    // ... 残りは同じ
  };
  // ...
}
```

BookingSummary 呼び出しに追加:

```typescript
<BookingSummary
  locationName={summary.locationName}  // 追加
  spaceName={summary.spaceName}
  // ... 残りは同じ
/>
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(public)/reservation/_components/customer-step.tsx'
git commit -m "feat(reservation): pass locationName through CustomerStep"
```

---

## Task 8: DateTimeSection 統合ラッパー新規作成

**Files:**

- Create: `src/app/(public)/reservation/_components/date-time-section.tsx`

この コンポーネントは CalendarPicker + TimeSlotGrid + DurationPills + GuestStepper を1セクションにまとめ、日時関連のフェッチロジック（`fetchAvailableSlots`、スロット state）を局所化する。

- [ ] **Step 1: コンポーネント実装**

```typescript
"use client";

import { useState, useTransition, useEffect, useRef, type ReactElement } from "react";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { addMinutesToTime } from "@/shared/lib/reservation/time-slots-utils";
import { fetchAvailableSlots } from "@/public/actions/availability";
import { CalendarPicker } from "./calendar-picker";
import { TimeSlotGrid } from "./time-slot-grid";
import { DurationPills } from "./duration-pills";
import { GuestStepper } from "./guest-stepper";

interface DateTimeSectionProps {
  readonly spaceId: string;
  readonly spaceCapacity: number;
  readonly businessHours: BusinessHours | null;
  readonly selectedDate: Date | undefined;
  readonly selectedStartTime: string | null;
  readonly selectedDuration: number | null;
  readonly numberOfGuests: number;
  readonly onDateChange: (date: Date | undefined) => void;
  readonly onStartTimeChange: (time: string | null) => void;
  readonly onDurationChange: (minutes: number | null) => void;
  readonly onGuestsChange: (count: number) => void;
}

export function DateTimeSection({
  spaceId,
  spaceCapacity,
  businessHours,
  selectedDate,
  selectedStartTime,
  selectedDuration,
  numberOfGuests,
  onDateChange,
  onStartTimeChange,
  onDurationChange,
  onGuestsChange,
}: DateTimeSectionProps): ReactElement {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isFetchingSlots, startFetchTransition] = useTransition();
  const sectionRef = useRef<HTMLDivElement>(null);

  // Fetch slots when date changes
  useEffect(() => {
    if (!selectedDate || !spaceId) {
      setSlots([]);
      return;
    }
    const dateStr = [
      selectedDate.getFullYear(),
      String(selectedDate.getMonth() + 1).padStart(2, "0"),
      String(selectedDate.getDate()).padStart(2, "0"),
    ].join("-");

    startFetchTransition(async () => {
      const result = await fetchAvailableSlots(spaceId, dateStr);
      setSlots(result);
    });
  }, [selectedDate, spaceId]);

  // Calculate max consecutive duration from selected start time
  const maxDuration = (() => {
    if (!selectedStartTime) return 0;
    const startIdx = slots.findIndex((s) => s.time === selectedStartTime);
    if (startIdx === -1) return 0;
    let count = 0;
    for (let i = startIdx; i < slots.length; i++) {
      if (!slots[i]?.available) break;
      count++;
    }
    return count * 30;
  })();

  return (
    <div ref={sectionRef} className="grid gap-6 md:grid-cols-2">
      {/* Left: Calendar */}
      <div>
        <h3 className="mb-3 font-heading text-base tracking-tight">
          日付を選択
        </h3>
        <CalendarPicker
          selectedDate={selectedDate}
          onSelect={onDateChange}
          businessHours={businessHours}
        />
      </div>

      {/* Right: Time + Duration + Guests */}
      <div className="space-y-6">
        {selectedDate ? (
          <>
            <div>
              <h3 className="mb-3 font-heading text-base tracking-tight">
                時間帯を選択
              </h3>
              <TimeSlotGrid
                slots={slots}
                selectedTime={selectedStartTime}
                onSelect={onStartTimeChange}
                isLoading={isFetchingSlots}
              />
            </div>

            {selectedStartTime ? (
              <div>
                <h3 className="mb-3 font-heading text-base tracking-tight">
                  利用時間
                </h3>
                <DurationPills
                  selectedMinutes={selectedDuration}
                  maxMinutes={maxDuration}
                  onSelect={onDurationChange}
                />
              </div>
            ) : null}

            {selectedDuration ? (
              <div>
                <h3 className="mb-3 font-heading text-base tracking-tight">
                  利用人数
                </h3>
                <GuestStepper
                  value={numberOfGuests}
                  max={spaceCapacity}
                  onChange={onGuestsChange}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            カレンダーから日付を選択してください
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/date-time-section.tsx'
git commit -m "feat(reservation): add DateTimeSection wrapper component"
```

---

## Task 9: Server Action に locationId バリデーション追加

**Files:**

- Modify: `src/app/(public)/_shared/actions/reservation.ts`

- [ ] **Step 1: Space-Location 整合性検証を追加**

`createPublicReservationCommand` 呼び出しの前に追加:

```typescript
// Between Turnstile verification and createPublicReservationCommand:

// 2.5. Verify space belongs to location
const space = await prisma.space.findUnique({
  where: { id: parsed.data.spaceId },
  select: { locationId: true },
});
if (!space || space.locationId !== parsed.data.locationId) {
  return createMutationError(
    "選択されたスペースは指定された場所に属していません",
  );
}
```

import に `prisma` を追加:

```typescript
import { prisma } from "@/shared/db/prisma";
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/actions/reservation.ts'
git commit -m "feat(reservation): validate space-location relationship in submit action"
```

---

## Task 10: ReservationForm 全面書き直し

**Files:**

- Rewrite: `src/app/(public)/reservation/_components/reservation-form.tsx`

これが最大のタスク。プログレッシブ開示ロジック、カスケードリセット、全コンポーネント統合。

- [ ] **Step 1: 全面書き直し**

```typescript
"use client";

import { useState, useRef, type ReactElement } from "react";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  publicReservationSchema,
  type PublicReservationInput,
} from "@/shared/lib/validations/public-reservation";
import type { LocationWithSpaces } from "@/shared/domain/locations/public-queries";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { addMinutesToTime } from "@/shared/lib/reservation/time-slots-utils";
import { submitReservation } from "@/public/actions/reservation";
import { LocationSelector } from "./location-selector";
import { SpaceSelector } from "./space-selector";
import { DateTimeSection } from "./date-time-section";
import { BookingSummary } from "./booking-summary";
import { CustomerStep } from "./customer-step";
import { StickyBottomBar } from "./sticky-bottom-bar";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToRef(ref: React.RefObject<HTMLDivElement | null>) {
  ref.current?.scrollIntoView({
    behavior: prefersReducedMotion() ? "instant" : "smooth",
    block: "start",
  });
}

interface ReservationFormProps {
  readonly locations: readonly LocationWithSpaces[];
  readonly businessHours: BusinessHours | null;
}

export function ReservationForm({
  locations,
  businessHours,
}: ReservationFormProps): ReactElement {
  // --- Auto-skip logic ---
  const autoLocationId =
    locations.length === 1 ? (locations[0]?.id ?? null) : null;
  const autoLocation = autoLocationId
    ? locations.find((l) => l.id === autoLocationId)
    : null;
  const autoSpaceId =
    autoLocation?.spaces.length === 1
      ? (autoLocation.spaces[0]?.id ?? null)
      : null;

  // --- Selection state (Single Source of Truth) ---
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    autoLocationId,
  );
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    autoSpaceId,
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(
    null,
  );
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Derived values ---
  const currentLocation = locations.find((l) => l.id === selectedLocationId);
  const currentSpaces = currentLocation?.spaces ?? [];
  const currentSpace = currentSpaces.find((s) => s.id === selectedSpaceId);

  const showLocationSelector = locations.length > 1;
  const showSpaceSelector =
    selectedLocationId != null && currentSpaces.length > 1;
  const showDateTimeSection = selectedSpaceId != null;

  const endTime =
    selectedStartTime && selectedDuration
      ? addMinutesToTime(selectedStartTime, selectedDuration)
      : null;
  const price =
    currentSpace && selectedDuration
      ? (currentSpace.hourlyPrice * selectedDuration) / 60
      : null;

  // --- Section refs for scroll ---
  const spaceRef = useRef<HTMLDivElement>(null);
  const dateTimeRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  // --- react-hook-form (3-arg signature: schema, action, options) ---
  const { form, isPending, onSubmit } = usePublicForm(
    publicReservationSchema,
    async (data: PublicReservationInput) => {
      const result = await submitReservation(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
        return result;
      }
      setSubmitted(true);
      return result;
    },
    {
      defaultValues: {
        locationId: autoLocationId ?? "",
        spaceId: autoSpaceId ?? "",
        numberOfGuests: 1,
      },
    },
  );

  // --- Cascade reset handlers (plain functions, no useCallback — React Compiler handles memoization) ---
  function handleLocationSelect(id: string) {
    setSelectedLocationId(id);
    form.setValue("locationId", id);

    // Reset downstream
    setSelectedSpaceId(null);
    setSelectedDate(undefined);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("spaceId", "");
    form.setValue("date", "");
    form.setValue("startTime", "");
    form.setValue("endTime", "");

    // Auto-select space if only one
    const loc = locations.find((l) => l.id === id);
    if (loc?.spaces.length === 1 && loc.spaces[0]) {
      setSelectedSpaceId(loc.spaces[0].id);
      form.setValue("spaceId", loc.spaces[0].id);
      setTimeout(() => scrollToRef(dateTimeRef), 100);
    } else {
      setTimeout(() => scrollToRef(spaceRef), 100);
    }
  }

  function handleSpaceSelect(id: string) {
    setSelectedSpaceId(id);
    form.setValue("spaceId", id);

    // Reset downstream
    setSelectedDate(undefined);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("date", "");
    form.setValue("startTime", "");
    form.setValue("endTime", "");

    setTimeout(() => scrollToRef(dateTimeRef), 100);
  }

  function handleDateChange(date: Date | undefined) {
    setSelectedDate(date);
    setSelectedStartTime(null);
    setSelectedDuration(null);
    form.setValue("startTime", "");
    form.setValue("endTime", "");
    if (date) {
      const dateStr = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      form.setValue("date", dateStr);
    } else {
      form.setValue("date", "");
    }
  }

  function handleStartTimeChange(time: string | null) {
    setSelectedStartTime(time);
    setSelectedDuration(null);
    form.setValue("startTime", time ?? "");
    form.setValue("endTime", "");
  }

  function handleDurationChange(minutes: number | null) {
    setSelectedDuration(minutes);
    if (minutes && selectedStartTime) {
      const end = addMinutesToTime(selectedStartTime, minutes);
      form.setValue("endTime", end);
    } else {
      form.setValue("endTime", "");
    }
  }

  function handleGuestsChange(count: number) {
    setNumberOfGuests(count);
    form.setValue("numberOfGuests", count);
  }

  // --- Step transition ---
  const isStep1Complete =
    selectedLocationId != null &&
    selectedSpaceId != null &&
    selectedDate != null &&
    selectedStartTime != null &&
    selectedDuration != null &&
    endTime != null;

  async function goToStep2() {
    const valid = await form.trigger([
      "locationId",
      "spaceId",
      "date",
      "startTime",
      "endTime",
      "numberOfGuests",
    ]);
    if (valid) {
      setStep(2);
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? "instant" : "smooth",
      });
    }
  }

  function goToStep1() {
    setStep(1);
    setErrorMessage(null);
  }

  // --- Empty state ---
  if (locations.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        現在予約可能なスペースがありません
      </p>
    );
  }

  // --- Success state ---
  if (submitted) {
    return (
      <div className="py-12 text-center">
        <Heading level={2}>ご予約を受け付けました</Heading>
        <p className="mt-4 text-muted-foreground">
          確認メールをお送りしましたのでご確認ください。
        </p>
      </div>
    );
  }

  // --- Step 2: Customer info ---
  if (step === 2) {
    return (
      <form onSubmit={onSubmit}>
        <CustomerStep
          form={form}
          isPending={isPending}
          errorMessage={errorMessage}
          summary={{
            locationName: currentLocation?.name ?? "",
            spaceName: currentSpace?.name ?? "",
            date: form.getValues("date"),
            startTime: form.getValues("startTime"),
            endTime: form.getValues("endTime"),
            guests: numberOfGuests,
            price,
          }}
          onBack={goToStep1}
        />
      </form>
    );
  }

  // --- Step 1: Progressive disclosure ---
  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Location selection */}
      {showLocationSelector ? (
        <section>
          <Heading level={3} className="mb-4">
            場所を選択
          </Heading>
          <LocationSelector
            locations={locations}
            selectedId={selectedLocationId}
            onSelect={handleLocationSelect}
          />
        </section>
      ) : null}

      {/* Space selection */}
      {showSpaceSelector ? (
        <section ref={spaceRef} className="animate-section-enter">
          <Heading level={3} className="mb-4">
            スペースを選択
          </Heading>
          <SpaceSelector
            spaces={currentSpaces}
            selectedId={selectedSpaceId}
            onSelect={handleSpaceSelect}
          />
        </section>
      ) : null}

      {/* Date & Time selection — selectedSpaceId is guaranteed non-null by showDateTimeSection */}
      {showDateTimeSection && selectedSpaceId ? (
        <section ref={dateTimeRef} className="animate-section-enter">
          <DateTimeSection
            spaceId={selectedSpaceId}
            spaceCapacity={currentSpace?.capacity ?? 1}
            businessHours={businessHours}
            selectedDate={selectedDate}
            selectedStartTime={selectedStartTime}
            selectedDuration={selectedDuration}
            numberOfGuests={numberOfGuests}
            onDateChange={handleDateChange}
            onStartTimeChange={handleStartTimeChange}
            onDurationChange={handleDurationChange}
            onGuestsChange={handleGuestsChange}
          />
        </section>
      ) : null}

      {/* Summary + Next button */}
      {isStep1Complete && currentLocation && currentSpace ? (
        <>
          {/* Desktop summary */}
          <section ref={summaryRef} className="hidden animate-section-enter md:block">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <BookingSummary
                  locationName={currentLocation.name}
                  spaceName={currentSpace.name}
                  date={form.getValues("date")}
                  startTime={selectedStartTime ?? ""}
                  endTime={endTime ?? ""}
                  guests={numberOfGuests}
                  price={price}
                />
              </div>
              <Button type="button" onClick={goToStep2}>
                次へ
              </Button>
            </div>
          </section>

          {/* Mobile sticky bar */}
          <div className="h-20 md:hidden" />
          <StickyBottomBar>
            <div className="flex items-center gap-3">
              {price !== null ? (
                <span className="font-heading text-lg text-accent">
                  &yen;{price.toLocaleString()}
                </span>
              ) : null}
              <Button
                type="button"
                onClick={goToStep2}
                className="ml-auto"
              >
                次へ
              </Button>
            </div>
          </StickyBottomBar>
        </>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: page.tsx から渡す props 型の不一致エラー → 次タスクで修正

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/reservation/_components/reservation-form.tsx'
git commit -m "feat(reservation): rewrite ReservationForm with progressive disclosure"
```

---

## Task 11: page.tsx をLocationベースに変更

**Files:**

- Rewrite: `src/app/(public)/reservation/page.tsx`

- [ ] **Step 1: データ取得を変更**

import の変更:

```typescript
// 削除
import { getPublishedSpaces } from "@/shared/domain/spaces/public-queries";
// 追加
import { getPublishedLocationsWithSpaces } from "@/shared/domain/locations/public-queries";
```

データ取得の変更:

```typescript
const [content, locations, businessHours] = await Promise.all([
  getPageContent(
    "reservation",
    simplePageContentSchema,
    defaultReservationContent,
  ),
  getPublishedLocationsWithSpaces(),
  getBusinessHoursSettingsQuery(),
]);
```

ReservationForm への props 変更:

```typescript
<ReservationForm locations={locations} businessHours={businessHours} />
```

旧 `spaces` の map 処理は完全削除。

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`
Expected: PASS（全パイプラインが接続）

- [ ] **Step 3: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/reservation/page.tsx'
git commit -m "feat(reservation): switch page data fetching to location-based query"
```

---

## Task 12: ビルド検証 + 最終確認

**Files:** なし（検証のみ）

- [ ] **Step 1: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 2: ビルド確認**

Run: `bun run build`
Expected: PASS（警告は許容）

- [ ] **Step 3: 既存テスト確認**

Run: `bun run test:unit`
Expected: `time-slots.test.ts` は PASS。`public-reservation` スキーマを使うテストがあれば `locationId` 追加で調整が必要

- [ ] **Step 4: テスト修正（必要に応じて）**

`public-reservation` スキーマのテストデータに `locationId` を追加。

- [ ] **Step 5: 最終コミット**

```bash
git commit -m "chore(reservation): fix tests for locationId addition"
```
