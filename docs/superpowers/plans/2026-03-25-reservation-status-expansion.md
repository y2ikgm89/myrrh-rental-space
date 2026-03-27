# 予約ステータス拡張 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReservationStatus に COMPLETED / NO_SHOW を追加し、ステータス遷移ルールをドメイン層に導入する

**Architecture:** Prisma enum 拡張 → ドメイン層に遷移バリデーション追加 → UI・統計クエリを5ステータス対応に更新。破壊的変更OK、後方互換性ハックなし。

**Tech Stack:** Prisma 7.5 / Next.js 16 / React 19 / TypeScript 6 / Zod 4 / bun:test

**Spec:** `docs/superpowers/specs/2026-03-25-reservation-status-expansion.md`

---

## Task 1: Prisma スキーマ + マイグレーション

**Files:**

- Modify: `prisma/schema.prisma:29-33`

- [ ] **Step 1: schema.prisma の enum を更新**

```prisma
enum ReservationStatus {
  PENDING
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}
```

- [ ] **Step 2: マイグレーション実行**

Run: `bunx --bun prisma migrate dev --name add-completed-noshow-statuses`

- [ ] **Step 3: Prisma Client 再生成を確認**

Run: `bun run type-check`
Expected: 型エラーが出る（`StatusConfig<ReservationStatus>` で COMPLETED / NO_SHOW が未定義）。これは後続タスクで解消する。

- [ ] **Step 4: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(reservation): add COMPLETED and NO_SHOW to ReservationStatus enum"
```

---

## Task 2: ドメイン層 — 遷移バリデーション + ヘルパー定数

**Files:**

- Modify: `src/shared/domain/reservations/commands.ts:527-569`
- Modify: `src/shared/lib/validations/enums/helpers.ts:72-75`
- Test: `__tests__/unit/shared/domain/reservations/status-transition.test.ts` (create)

- [ ] **Step 1: テストファイルを作成**

`__tests__/unit/shared/domain/reservations/status-transition.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { validateStatusTransition } from "@/shared/domain/reservations/commands";
import { ReservationStatus } from "@/shared/db/enums";

describe("validateStatusTransition", () => {
  // 許可される遷移
  const allowedTransitions: [ReservationStatus, ReservationStatus][] = [
    [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
    [ReservationStatus.PENDING, ReservationStatus.CANCELLED],
    [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED],
    [ReservationStatus.CONFIRMED, ReservationStatus.NO_SHOW],
    [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
  ];

  for (const [from, to] of allowedTransitions) {
    test(`${from} → ${to} is allowed`, () => {
      expect(() => validateStatusTransition(from, to)).not.toThrow();
    });
  }

  // 終端状態からの遷移は全て拒否
  const terminalStatuses = [
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ];

  for (const terminal of terminalStatuses) {
    for (const target of Object.values(ReservationStatus)) {
      if (terminal === target) continue;
      test(`${terminal} → ${target} is rejected (terminal state)`, () => {
        expect(() => validateStatusTransition(terminal, target)).toThrow(
          "このステータスからは変更できません",
        );
      });
    }
  }

  // PENDING → COMPLETED は不許可（CONFIRMED を経由する必要あり）
  test("PENDING → COMPLETED is rejected", () => {
    expect(() =>
      validateStatusTransition(
        ReservationStatus.PENDING,
        ReservationStatus.COMPLETED,
      ),
    ).toThrow();
  });

  // PENDING → NO_SHOW は不許可
  test("PENDING → NO_SHOW is rejected", () => {
    expect(() =>
      validateStatusTransition(
        ReservationStatus.PENDING,
        ReservationStatus.NO_SHOW,
      ),
    ).toThrow();
  });

  // 同一ステータスへの遷移は no-op（エラーにしない）
  test("same status transition is allowed (no-op)", () => {
    expect(() =>
      validateStatusTransition(
        ReservationStatus.CONFIRMED,
        ReservationStatus.CONFIRMED,
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/shared/domain/reservations/status-transition.test.ts`
Expected: FAIL（`validateStatusTransition` が存在しない）

- [ ] **Step 3: helpers.ts に定数を追加**

`src/shared/lib/validations/enums/helpers.ts` — 既存の `ACTIVE_RESERVATION_STATUSES` の下に追加:

```typescript
/**
 * 終端ステータス（変更不可）
 */
export const TERMINAL_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.COMPLETED,
  ReservationStatus.CANCELLED,
  ReservationStatus.NO_SHOW,
];

/**
 * 作成時に許可するステータス
 */
export const CREATABLE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];
```

- [ ] **Step 4: commands.ts に validateStatusTransition を実装**

`src/shared/domain/reservations/commands.ts` — ファイル先頭の import 後、ヘルパー関数セクションに追加:

```typescript
import { TERMINAL_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

// 許可される遷移マップ
const ALLOWED_TRANSITIONS: ReadonlyMap<
  ReservationStatus,
  readonly ReservationStatus[]
> = new Map([
  [
    ReservationStatus.PENDING,
    [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
  ],
  [
    ReservationStatus.CONFIRMED,
    [
      ReservationStatus.COMPLETED,
      ReservationStatus.NO_SHOW,
      ReservationStatus.CANCELLED,
    ],
  ],
]);

/**
 * ステータス遷移のバリデーション
 * 不正な遷移は DomainError を throw
 */
export function validateStatusTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): void {
  if (from === to) return;

  const allowed = ALLOWED_TRANSITIONS.get(from);
  if (!allowed || !allowed.includes(to)) {
    throw new DomainError("このステータスからは変更できません", "VALIDATION");
  }
}
```

- [ ] **Step 5: updateReservationStatusCommand に遷移バリデーションを追加**

`commands.ts` の `updateReservationStatusCommand` 内、`previousStatus` 取得後に:

```typescript
validateStatusTransition(reservation.status, status);
```

- [ ] **Step 6: createAdminReservationCommand に終端ステータス拒否を追加**

`commands.ts` の `createAdminReservationCommand` 冒頭に:

```typescript
import { CREATABLE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

// createAdminReservationCommand 内、最初のバリデーションとして:
if (!CREATABLE_RESERVATION_STATUSES.includes(input.status)) {
  throw new DomainError(
    "作成時のステータスは「保留中」または「確認済み」のみ指定できます",
    "VALIDATION",
  );
}
```

- [ ] **Step 7: updateAdminReservationCommand にも遷移バリデーションを追加**

`commands.ts` の `updateAdminReservationCommand` 内、`currentReservation` 取得後に:

```typescript
validateStatusTransition(currentReservation.status, input.status);
```

ただし `currentReservation` の select に `status` を追加する必要がある:

```typescript
select: {
  id: true,
  status: true,  // 追加
  couponId: true,
  googleCalendarEventId: true,
  customer: { select: CUSTOMER_SELECT },
},
```

- [ ] **Step 8: テスト実行**

Run: `bun test __tests__/unit/shared/domain/reservations/status-transition.test.ts`
Expected: ALL PASS

- [ ] **Step 9: 型チェック**

Run: `bun run type-check`
Expected: status-badges.tsx 等で型エラー（COMPLETED / NO_SHOW 未定義）。Task 3 で解消。

- [ ] **Step 10: コミット**

```bash
git add src/shared/domain/reservations/commands.ts src/shared/lib/validations/enums/helpers.ts __tests__/unit/shared/domain/reservations/status-transition.test.ts
git commit -m "feat(reservation): add status transition validation with COMPLETED/NO_SHOW support"
```

---

## Task 3: UI コンポーネント — Badge + StatusSelect + Filters + Calendar

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/status-badges.tsx:43-47`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationStatusSelect.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationFilters.tsx:5-10`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx:77-89`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventDetailDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/calendar/calendar-domain.ts:244-254`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/admin-reservation.ts`

- [ ] **Step 1: status-badges.tsx を更新**

```typescript
const reservationStatusConfig: StatusConfig<ReservationStatus> = {
  PENDING: { label: "保留中", variant: "pending" },
  CONFIRMED: { label: "確認済み", variant: "success" },
  COMPLETED: { label: "完了", variant: "default" },
  CANCELLED: { label: "キャンセル", variant: "destructive" },
  NO_SHOW: { label: "無断キャンセル", variant: "warning" },
};
```

- [ ] **Step 2: ReservationStatusSelect.tsx を遷移ルール対応に書き換え**

遷移可能なステータスのみ選択肢に表示。終端ステータスではセレクト自体を無効化:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { updateReservationStatus } from "@/admin/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";
import { ReservationStatus } from "@/shared/db/enums";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";

type ReservationStatusSelectProps = {
  reservationId: string;
  currentStatus: ReservationStatus;
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: "保留中",
  CONFIRMED: "確認済み",
  COMPLETED: "完了",
  CANCELLED: "キャンセル",
  NO_SHOW: "無断キャンセル",
};

const ALLOWED_TRANSITIONS: Record<string, readonly ReservationStatus[]> = {
  PENDING: [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
  CONFIRMED: [
    ReservationStatus.COMPLETED,
    ReservationStatus.NO_SHOW,
    ReservationStatus.CANCELLED,
  ],
};

export function ReservationStatusSelect({
  reservationId,
  currentStatus,
}: ReservationStatusSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const allowedTargets = ALLOWED_TRANSITIONS[currentStatus];
  const isTerminal = !allowedTargets || allowedTargets.length === 0;

  const handleStatusChange = (newStatus: ReservationStatus) => {
    if (newStatus === currentStatus) return;

    startTransition(async () => {
      const result = await updateReservationStatus(reservationId, newStatus);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("ステータスを更新しました");
      router.refresh();
    });
  };

  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => {
        if (isValidReservationStatus(value)) handleStatusChange(value);
      }}
      disabled={isPending || isTerminal}
    >
      <SelectTrigger className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={currentStatus}>
          {STATUS_LABELS[currentStatus]}
        </SelectItem>
        {allowedTargets?.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: ReservationFilters.tsx を更新**

```typescript
const STATUS_OPTIONS: StatusOption[] = [
  { value: "ALL", label: "すべて" },
  { value: "PENDING", label: "確認待ち" },
  { value: "CONFIRMED", label: "確定" },
  { value: "COMPLETED", label: "完了" },
  { value: "CANCELLED", label: "キャンセル" },
  { value: "NO_SHOW", label: "無断キャンセル" },
];
```

- [ ] **Step 4: ReservationEditForm.tsx のステータスオプションを更新**

ローカルの `RESERVATION_STATUS_OPTIONS` を、遷移ルールに基づいて動的生成に変更。`reservation` prop から `currentStatus` を取得し、遷移可能なステータスのみリストに含める。具体的な実装はファイルの既存パターンに従う。最低限、5ステータスすべてのラベルを定義し、現在のステータス + 遷移先のみ options に含める。

- [ ] **Step 5: EventDetailDialog.tsx のステータスセレクトを遷移ルール対応に**

カレンダービューのイベント詳細ダイアログにもステータス変更セレクトがある。`ReservationStatusSelect` と同じ遷移ルール（`ALLOWED_TRANSITIONS`）を適用し、終端ステータスでは変更不可にする。

- [ ] **Step 6: admin-reservation.ts の作成スキーマに `.refine()` を追加**

Zod スキーマ側でも終端ステータスでの作成を拒否する（ドメイン層との二重防御）:

```typescript
import { CREATABLE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

// 作成スキーマの status フィールドに refine を追加:
status: z.enum(ReservationStatus).refine(
  (s) => CREATABLE_RESERVATION_STATUSES.includes(s),
  { message: "作成時のステータスは「保留中」または「確認済み」のみ指定できます" },
),
```

- [ ] **Step 7: calendar-domain.ts の getStatusColorClass を更新**

```typescript
export function getStatusColorClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-warning/10 border-l-warning text-warning-foreground";
    case "CONFIRMED":
      return "bg-success/10 border-l-success text-success";
    case "COMPLETED":
      return "bg-muted border-l-foreground/50 text-foreground";
    case "CANCELLED":
      return "bg-muted border-l-muted-foreground text-muted-foreground line-through";
    case "NO_SHOW":
      return "bg-warning/10 border-l-destructive text-destructive";
    default:
      return "bg-info/10 border-l-info text-info";
  }
}
```

- [ ] **Step 8: 型チェック**

Run: `bun run type-check`
Expected: PASS（全 `StatusConfig<ReservationStatus>` が5値をカバー）

- [ ] **Step 9: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/status-badges.tsx src/app/'(admin)'/admin/'(dashboard)'/reservations/_components/ReservationStatusSelect.tsx src/app/'(admin)'/admin/'(dashboard)'/reservations/_components/ReservationFilters.tsx src/app/'(admin)'/admin/'(dashboard)'/reservations/_components/ReservationEditForm.tsx src/app/'(admin)'/admin/'(dashboard)'/reservations/_components/calendar/EventDetailDialog.tsx src/app/'(admin)'/admin/'(dashboard)'/_shared/lib/calendar/calendar-domain.ts src/app/'(admin)'/admin/'(dashboard)'/_shared/lib/validations/admin-reservation.ts
git commit -m "feat(reservation): update UI components for 5-status model with transition rules"
```

---

## Task 4: Server Actions 副作用 — COMPLETED / NO_SHOW のカレンダー・メール処理

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts:40-142`

- [ ] **Step 1: mutations.ts の updateReservationStatus を更新**

COMPLETED と NO_SHOW の副作用を追加。COMPLETED/NO_SHOW はカレンダー変更なし・メール送信なし:

`afterSuccess` コールバック内、CONFIRMED ブロックと CANCELLED ブロックの間に:

```typescript
// COMPLETED: カレンダー変更なし、メール送信なし（過去の予定を維持）
// NO_SHOW: カレンダー変更なし、メール送信なし（過去の予定を維持）
// → 特別な処理は不要。キャッシュ無効化のみ（末尾で実行済み）
```

既存の CANCELLED ブロックの条件を確認。`status === ReservationStatus.CANCELLED` の条件分岐はそのまま維持。COMPLETED / NO_SHOW は追加のアクション不要なので、既存コードの CONFIRMED / CANCELLED 以外のケースは自然にスルーされる。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/reservation/mutations.ts
git commit -m "feat(reservation): add COMPLETED/NO_SHOW side effects in status mutation"
```

---

## Task 5: ダッシュボード統計 — クエリ修正

**Files:**

- Modify: `src/shared/domain/dashboard/queries.ts:95-320`
- Modify: `src/shared/domain/reservations/admin-queries.ts:241-285`

- [ ] **Step 1: getDashboardStats の予約数クエリを修正**

`status: { not: ReservationStatus.CANCELLED }` を:

```typescript
status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] },
```

thisMonthReservations と lastMonthReservations の両方に適用。

- [ ] **Step 2: getDashboardStats の売上クエリを修正**

`status: ReservationStatus.CONFIRMED` を:

```typescript
status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED] },
```

thisMonthRevenue と lastMonthRevenue の両方に適用。

- [ ] **Step 3: getTodayReservations の除外条件を修正**

`status: { not: ReservationStatus.CANCELLED }` を:

```typescript
status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] },
```

- [ ] **Step 4: getReservationChartData の raw SQL を修正**

ハードコード文字列を `Prisma.join` でパラメータ化:

```typescript
import { Prisma } from "@/shared/db/prisma";

const excludeStatuses = [
  ReservationStatus.CANCELLED,
  ReservationStatus.NO_SHOW,
];
const revenueStatuses = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.COMPLETED,
];

const dailyStats = await prisma.$queryRaw<DailyStats[]>`
  SELECT
    DATE("createdAt") as date,
    COUNT(*)::bigint as reservations,
    SUM(CASE WHEN status IN (${Prisma.join(revenueStatuses)}) THEN "totalPrice"::numeric ELSE 0 END) as revenue
  FROM "reservations"
  WHERE "createdAt" >= ${oldestIncludedDate}
    AND status NOT IN (${Prisma.join(excludeStatuses)})
  GROUP BY DATE("createdAt")
  ORDER BY date ASC
`;
```

NOTE: `Prisma.join()` は `$queryRaw` タグ付きテンプレート内で配列を `$1, $2, ...` のパラメータリストに展開する公式 API。

- [ ] **Step 5: getReservationStatsQuery に COMPLETED / NO_SHOW カウントを追加**

`src/shared/domain/reservations/admin-queries.ts` の `getReservationStatsQuery`:

```typescript
const [
  total,
  pending,
  confirmed,
  completed,
  cancelled,
  noShow,
  todayCount,
  thisWeekCount,
] = await Promise.all([
  prisma.reservation.count(),
  prisma.reservation.count({ where: { status: ReservationStatus.PENDING } }),
  prisma.reservation.count({ where: { status: ReservationStatus.CONFIRMED } }),
  prisma.reservation.count({ where: { status: ReservationStatus.COMPLETED } }),
  prisma.reservation.count({ where: { status: ReservationStatus.CANCELLED } }),
  prisma.reservation.count({ where: { status: ReservationStatus.NO_SHOW } }),
  prisma.reservation.count({
    where: {
      startTime: {
        gte: today,
        lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    },
  }),
  prisma.reservation.count({
    where: { startTime: { gte: weekStart } },
  }),
]);

return {
  total,
  pending,
  confirmed,
  completed,
  cancelled,
  noShow,
  todayCount,
  thisWeekCount,
};
```

この戻り値の型変更に伴い、呼び出し側の UI コンポーネント（予約一覧ページのステータスカード等）も更新が必要。

- [ ] **Step 6: 型チェック**

Run: `bun run type-check`
Expected: PASS（戻り値型が変わった場合は呼び出し側の修正も必要）

- [ ] **Step 7: コミット**

```bash
git add src/shared/domain/dashboard/queries.ts src/shared/domain/reservations/admin-queries.ts
git commit -m "fix(dashboard): update statistics queries for 5-status model"
```

---

## Task 6: Seed データ更新

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: seed.ts の予約ステータス型を更新**

ステータス型定義に COMPLETED / NO_SHOW を追加し、サンプルデータに過去日のCOMPLETED 予約と NO_SHOW 予約を数件追加。

- [ ] **Step 2: seed 実行テスト**

Run: `bun prisma/seed.ts`
Expected: 正常完了

- [ ] **Step 3: コミット**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): add COMPLETED and NO_SHOW reservation samples"
```

---

## Task 7: 全体検証

- [ ] **Step 1: 全テスト実行**

Run: `bun run test`
Expected: ALL PASS

- [ ] **Step 2: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: ビルド確認**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: 目視確認ポイント**（dev サーバーで確認）

1. 予約一覧: フィルターに「完了」「無断キャンセル」が表示される
2. 予約詳細: CONFIRMED 予約のステータスセレクトに「完了」「無断キャンセル」「キャンセル」が表示される
3. 予約詳細: COMPLETED / CANCELLED / NO_SHOW 予約はセレクトが disabled
4. カレンダービュー: COMPLETED は通常表示、NO_SHOW は赤系表示
5. ダッシュボード: 統計カードが正しく集計される
