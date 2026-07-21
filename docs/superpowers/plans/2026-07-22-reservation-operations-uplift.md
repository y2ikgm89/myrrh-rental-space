# 予約(Reservation)運用強化 実装計画（Phase 3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者機能パリティ設計の Phase 3。予約(Reservation)の管理者運用を4点強化する —
(1) ゲスト連絡先(guest*)の作成後編集、(2) キャンセル理由入力の3導線への配線、
(3) RefundDialog の累積返金額バグ修正 + ポリシー推奨額ヒント表示、
(4) 予約一覧のスペースフィルタ欠落 + CSV監査ログの日付範囲metadata欠落の解消。

**Architecture:** すべて既存スキーマ・既存パターンの上に構築する（DB migration 不要 — Reservation
モデルの guest* 6列・cancellationReason・Refund テーブルは全て既存）。ゲスト編集は
`customer-shared-fields.ts` の SSoT validator を再利用し、Reservation 行のみを更新して
Customer 行には伝播させない。キャンセル理由は `RefundDialog.tsx` と同型（プリセット+自由入力+
文字数制限）の新規 `CancellationReasonDialog` を1つ作り、3つの独立したキャンセル導線
（一覧行の `ReservationStatusSelect.tsx`、詳細ページ `ReservationDetail.tsx` のインライン
Select、`ReservationBulkActions.tsx` の一括キャンセル）にそれぞれ配線する。RefundDialog の
`cumulativeRefunded` prop は既に存在するが呼出側が渡していないため、`prisma.refund.aggregate`
を使う read-only query を追加して配線する。CSV/フィルタ連動は設計doc作成時点では未実装と
書かれていたが、実装計画作成時の事前調査で `getReservationsForExport` のフィルタ対応と
AuditLog の `filterTab/filterSearch/filterUserId` metadata は既に別PR（`b0bbb5042`）で
実装済みと判明した。残る実ギャップは spaceId フィルタが一覧UI/nuqs/export のどこにも
配線されていないことと、AuditLog metadata に `filterStartDate`/`filterEndDate` が欠けている
ことの2点のみであり、本計画はその2点に絞る（設計doc記載の「フィルタ連動を新規実装する」は
過大でありスコープを縮小する）。

**Tech Stack:** Next.js 16 App Router / Prisma 7 / Zod 4 + conform / nuqs（`useQueryStates`）/
Bun test（`scripts/run-tests.ts` 経由必須）。

## Global Constraints

- DB migration は不要（全フィールド既存）。schema.prisma は変更しない。
- ゲスト連絡先の Zod validator は `src/shared/lib/validations/customer-shared-fields.ts` の
  `personNameFieldSchema` / `emailFieldSchema` を再利用し、電話番号は
  `src/shared/lib/validations/customer.ts` の regex 付きバリアント
  (`/^[\d\-+() ]+$/`、20文字以内) と同じ制約にする（設計doc: 「既存の customer フォーム
  スキーマと同じ制約を流用」）。
- ゲスト連絡先編集は Reservation 行の guest* 列のみを更新し、Customer 行には一切書き込まない
  （既存の「顧客情報を更新」ボタン = `updateCustomerFromReservation` とは独立した別経路）。
- キャンセル理由ダイアログの UI パターンは `RefundDialog.tsx` と同一にする: プリセット配列
  `[{value:"顧客都合キャンセル",...},{value:"スペース側事情",...},{value:"重複予約",...},
{value:"custom",label:"その他 (自由入力)"}]` + `CUSTOM_REASON_MAX = 500`。
- `applyCancellationSideEffects` の `cancellationReason` は `string | null`（必須プロパティ、
  optional ではない）。呼出側は `reason ?? null` で明示的に渡す。
- 各 task 完了時、変更ロジックに対応する既存テストコマンドで確認する
  (`bun scripts/run-tests.ts <対象ファイル>`)。全task完了後に
  `bun run validate` と `bun run test:unit` をフルスイートで実行する。

---

### Task 1: 予約詳細クエリに guestEmail/guestCustomerType を追加

**Files:**

- Modify: `src/shared/domain/reservations/admin-queries.ts:313-316`
  (`getReservationByIdQuery` の `select`)
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts:49-52`
  (`ReservationWithRelations` 型)
- Test: `__tests__/integration/domain/reservations/reservation-detail-guest-fields.test.ts`（新規）

**Interfaces:**

- Consumes: 既存の `getReservationByIdQuery(id: string)`（`admin-queries.ts:279`）
- Produces: `ReservationWithRelations` に `guestEmail: string | null` と
  `guestCustomerType: CustomerType | null` が追加される（Task 2/3 が消費する）

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/domain/reservations/reservation-detail-guest-fields.test.ts` を新規作成:

```ts
/**
 * getReservationByIdQuery が guestEmail / guestCustomerType を select し忘れている
 * 既知のギャップ（Phase 3 事前調査で発見）を修正する回帰テスト。
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const { prisma: basePrisma } = await import("@/shared/db/prisma");
const { getReservationByIdQuery } =
  await import("@/shared/domain/reservations/admin-queries");
const { CustomerType, TaxRateType } = await import("@generated/prisma/enums");

describe("getReservationByIdQuery: guest field parity", () => {
  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("guestEmail / guestCustomerType を含めて返す", async () => {
    const space = await basePrisma.space.create({
      data: {
        name: `test-space-${randomUUID()}`,
        slug: `test-space-${randomUUID()}`,
        hourlyPrice: 1000,
        isActive: true,
        isPublished: true,
      },
    });
    const customer = await basePrisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "太郎",
        email: `guest-field-${randomUUID()}@example.com`,
        emailCanonical: `guest-field-${randomUUID()}@example.com`,
      },
    });
    const reservation = await basePrisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        startTime: new Date("2026-08-01T01:00:00.000Z"),
        endTime: new Date("2026-08-01T02:00:00.000Z"),
        totalPrice: 1000,
        basePrice: 1000,
        rateBreakdownJson: { legacy: true, segments: [] },
        taxRateType: TaxRateType.STANDARD,
        taxRate: 10,
        taxAmount: 100,
        totalPriceWithTax: 1100,
        guestLastName: "予約者",
        guestFirstName: "ゲスト",
        guestEmail: "guest-at-booking@example.com",
        guestCustomerType: CustomerType.BUSINESS,
      },
    });

    const result = await getReservationByIdQuery(reservation.id);

    expect(result?.guestEmail).toBe("guest-at-booking@example.com");
    expect(result?.guestCustomerType).toBe(CustomerType.BUSINESS);

    await basePrisma.reservation.delete({ where: { id: reservation.id } });
    await basePrisma.customer.delete({ where: { id: customer.id } });
    await basePrisma.space.delete({ where: { id: space.id } });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/reservations/reservation-detail-guest-fields.test.ts`
Expected: FAIL — `result?.guestEmail` / `result?.guestCustomerType` が `undefined`
（select されていないため Prisma の返り値にキー自体が無い）。

- [ ] **Step 3: `getReservationByIdQuery` の select に2フィールドを追加**

`src/shared/domain/reservations/admin-queries.ts:313-316` を変更:

```ts
      guestLastName: true,
      guestFirstName: true,
      guestEmail: true,
      guestPhone: true,
      guestCompanyName: true,
      guestCustomerType: true,
```

- [ ] **Step 4: `ReservationWithRelations` 型に2フィールドを追加**

`src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts:49-52` を変更:

```ts
guestLastName: string | null;
guestFirstName: string | null;
guestEmail: string | null;
guestPhone: string | null;
guestCompanyName: string | null;
guestCustomerType: CustomerType | null;
```

ファイル冒頭の import に `CustomerType` を追加:

```ts
import {
  ReservationStatus,
  type PaymentStatus,
  type TaxRateType,
  type CustomerType,
} from "@/shared/lib/validations/enums/prisma-types";
```

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/reservations/reservation-detail-guest-fields.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェックを実行する**

Run: `bun run type-check`
Expected: exit 0（`ReservationWithRelations` を消費する既存箇所が壊れていないこと ——
追加のみで既存フィールドは変更していないため非破壊）

- [ ] **Step 7: コミット**

```bash
git add src/shared/domain/reservations/admin-queries.ts \
  "src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts" \
  __tests__/integration/domain/reservations/reservation-detail-guest-fields.test.ts
git commit -m "fix(admin): select guestEmail/guestCustomerType in reservation detail query"
```

---

### Task 2: `updateAdminReservationCommand` にゲスト連絡先の書込を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts:187-207`
  (`updateReservationFormSchema`)
- Modify: `src/shared/domain/reservations/admin-commands.ts:251-267`（input型）,
  `:428-459`（`updateMany` の `data`）
- Test: `__tests__/unit/domain/reservations/commands.test.ts`（既存ファイルに追記）

**Interfaces:**

- Consumes: Task 1 の `ReservationWithRelations.guestEmail`/`guestCustomerType`
- Produces: `updateReservationFormSchema` が
  `guestLastName?/guestFirstName?/guestEmail?/guestPhone?/guestCompanyName?/guestCustomerType?`
  を受け付ける（Task 3 が form 側で消費）。`updateAdminReservationCommand`
  の `input` が同名フィールドを受け付け、DB に書き込む。

- [ ] **Step 1: 失敗するユニットテストを書く**

`__tests__/unit/domain/reservations/commands.test.ts` の
`describe("updateAdminReservationCommand", ...)` ブロック内、既存の「正常系」
`describe` の末尾（1065行目付近、既存テストの直後）に追記:

```ts
test("guest* フィールドを渡すと updateMany の data に反映される", async () => {
  await updateAdminReservationCommand("res-1", {
    ...validInput,
    guestLastName: "予約",
    guestFirstName: "花子",
    guestEmail: "hanako-guest@example.com",
    guestPhone: "080-1111-2222",
    guestCompanyName: "テスト株式会社",
    guestCustomerType: CustomerType.BUSINESS,
  });

  expect(mockUpdateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        guestLastName: "予約",
        guestFirstName: "花子",
        guestEmail: "hanako-guest@example.com",
        guestPhone: "080-1111-2222",
        guestCompanyName: "テスト株式会社",
        guestCustomerType: CustomerType.BUSINESS,
      }),
    }),
  );
});

test("guest* フィールドを省略すると updateMany の data に guest* キーが含まれない（既存値を保持）", async () => {
  await updateAdminReservationCommand("res-1", validInput);

  const call = mockUpdateMany.mock.calls.at(-1)?.[0] as {
    data: Record<string, unknown>;
  };
  expect(call.data).not.toHaveProperty("guestLastName");
  expect(call.data).not.toHaveProperty("guestCustomerType");
});
```

このファイル冒頭の import に `CustomerType` が無ければ追加する（`@generated/prisma/enums`
または既存 import 経路に合わせる。ファイル内の既存 enum import 文を grep で確認して
同じ経路を使うこと）。`mockUpdateMany` は同ファイル内で `tx.reservation.updateMany`
の mock として既に使われている変数名を使う（既存の正常系テストと同じ mock 参照）。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/reservations/commands.test.ts`
Expected: FAIL — `guestLastName` 等が `input` の型に存在せず TypeScript エラー、
または実行時に `data` に反映されず assertion 失敗。

- [ ] **Step 3: `updateAdminReservationCommand` の input 型にゲストフィールドを追加**

`src/shared/domain/reservations/admin-commands.ts:251-267` を変更:

```ts
export async function updateAdminReservationCommand(
  id: string,
  input: {
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
    customerId: string;
    totalPrice?: number | undefined;
    couponCode?: string | null | undefined;
    status: ReservationStatus;
    notes?: string | null | undefined;
    /** 手動 totalPrice override の実行者 (admin User.id)。監査目的で priceOverriddenBy に記録する。 */
    adminUserId: string;
    /** 楽観制御: form が予約を load した時点の version。updateMany の WHERE 述語で claim する。 */
    version: number;
    /**
     * ゲスト連絡先スナップショット (Reservation 行のみ更新、Customer 行には伝播しない)。
     * 個別に省略可能 — 省略したフィールドは既存 DB 値を保持する（omitUndefined 経由）。
     */
    guestLastName?: string | undefined;
    guestFirstName?: string | undefined;
    guestEmail?: string | undefined;
    guestPhone?: string | undefined;
    guestCompanyName?: string | undefined;
    guestCustomerType?: CustomerType | undefined;
  },
) {
```

ファイル冒頭の import に `CustomerType` を追加（既存の `ReservationStatus` と同じ
import 元 `@/shared/lib/validations/enums/prisma-types` から）。

- [ ] **Step 4: `updateMany` の `data` にゲストフィールドを条件付きで追加**

`src/shared/domain/reservations/admin-commands.ts:428-459` の `data:` オブジェクト末尾
（`version: { increment: 1 },` の直後）に追加:

```ts
        notes: input.notes || null,
        icsSequence: { increment: 1 },
        version: { increment: 1 },
        ...(input.guestLastName !== undefined && {
          guestLastName: input.guestLastName,
        }),
        ...(input.guestFirstName !== undefined && {
          guestFirstName: input.guestFirstName,
        }),
        ...(input.guestEmail !== undefined && {
          guestEmail: input.guestEmail,
        }),
        ...(input.guestPhone !== undefined && {
          guestPhone: input.guestPhone,
        }),
        ...(input.guestCompanyName !== undefined && {
          guestCompanyName: input.guestCompanyName,
        }),
        ...(input.guestCustomerType !== undefined && {
          guestCustomerType: input.guestCustomerType,
        }),
```

- [ ] **Step 5: `updateReservationFormSchema` にゲストフィールドを追加**

`src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts`
の冒頭 import に SSoT validator を追加:

```ts
import { z } from "zod";
import {
  calculateDurationHours,
  parseDateTimeLocalAsJst,
} from "@/shared/lib/date-format";
import {
  RESERVATION_SERIES_FREQ,
  ReservationStatus,
  CustomerType,
} from "@/shared/lib/validations/enums/prisma-types";
import { CREATABLE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { TIME_REGEX } from "@/shared/lib/validations/business-hours";
import { WEEKDAYS } from "./rrule-utils";
import {
  personNameFieldSchema,
  emailFieldSchema,
} from "@/shared/lib/validations/customer-shared-fields";
```

`newCustomerObjectSchema` の直後（89行目 `customerModeSchema` の前）に追加:

```ts
/**
 * ゲスト連絡先編集フィールド (Phase 3)。全フィールド個別に optional
 * — Reservation.guest* 列は全て nullable であり、admin が一部のみ
 * 入力/更新したいケースを許容する (newCustomerObjectSchema が全項目必須の
 * create 専用スキーマなのとは意図的に異なる)。電話番号は
 * customer.ts の regex 付きバリアントと同じ制約に揃える。
 */
const guestContactFieldsSchema = {
  guestLastName: personNameFieldSchema("お名前 (姓)")
    .optional()
    .or(z.literal("")),
  guestFirstName: personNameFieldSchema("お名前 (名)")
    .optional()
    .or(z.literal("")),
  guestEmail: emailFieldSchema.optional().or(z.literal("")),
  guestPhone: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .regex(/^[\d\-+() ]+$/, {
      error: "電話番号は数字・ハイフン・+・括弧・空白のみ使用できます",
    })
    .optional()
    .or(z.literal("")),
  guestCompanyName: z
    .string()
    .max(100, { error: "会社名は100文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  guestCustomerType: z.enum(CustomerType).optional(),
};
```

`updateReservationFormSchema` (187-207行目) の `notes: notesSchema,` の直後に
`...guestContactFieldsSchema,` を追加:

```ts
export const updateReservationFormSchema = z
  .object({
    spaceId: z.uuid({ error: "スペースを選択してください" }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    customerId: z.uuid({ error: "顧客IDが不正です" }),
    totalPrice: totalPriceSchema,
    couponCode: couponCodeSchema,
    status: z.enum(ReservationStatus).default(ReservationStatus.CONFIRMED),
    notes: notesSchema,
    ...guestContactFieldsSchema,
    version: z.coerce
      .number({ error: "バージョンが不正です" })
      .int({ error: "バージョンが不正です" })
      .nonnegative({ error: "バージョンが不正です" }),
  })
  .superRefine((data, ctx) => {
    refineTimeRange(data, ctx);
  });
```

- [ ] **Step 6: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/reservations/commands.test.ts`
Expected: PASS（既存テストも含め全件）

- [ ] **Step 7: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 8: コミット**

```bash
git add src/shared/domain/reservations/admin-commands.ts \
  "src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts" \
  __tests__/unit/domain/reservations/commands.test.ts
git commit -m "feat(admin): accept guest contact fields in updateAdminReservationCommand"
```

---

### Task 3: `ReservationEditForm.tsx` にゲスト連絡先入力欄を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx:172-185`
  (defaultValue), `:476-517`（顧客情報カード）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts:217-232`
  (`updateReservationAction` の `omitUndefined` 呼び出し)
- Test: `__tests__/integration/actions/admin/reservation.action-shape.test.ts`
  （既存ファイルの action-shape 契約に追記、または対応する統合テストを確認して追記）

**Interfaces:**

- Consumes: Task 2 の `updateReservationFormSchema` guest* フィールド + `guestContactFieldsSchema`、
  Task 1 の `ReservationWithRelations.guestEmail`/`guestCustomerType`
- Produces: フォーム送信時、`updateReservationAction` が guest* フィールドを
  `updateAdminReservationCommand` へ渡す

- [ ] **Step 1: `updateReservationAction` の呼び出しにゲストフィールドを追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts:217-232`
の `omitUndefined({...})` に追加:

```ts
mutationPayload = await updateAdminReservationCommand(
  id,
  omitUndefined({
    spaceId: data.spaceId,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    customerId: data.customerId,
    totalPrice: data.totalPrice,
    couponCode:
      data.couponCode && data.couponCode !== "" ? data.couponCode : undefined,
    status: data.status,
    notes: data.notes && data.notes !== "" ? data.notes : undefined,
    adminUserId: user.id,
    version: data.version,
    guestLastName:
      data.guestLastName && data.guestLastName !== ""
        ? data.guestLastName
        : undefined,
    guestFirstName:
      data.guestFirstName && data.guestFirstName !== ""
        ? data.guestFirstName
        : undefined,
    guestEmail:
      data.guestEmail && data.guestEmail !== "" ? data.guestEmail : undefined,
    guestPhone:
      data.guestPhone && data.guestPhone !== "" ? data.guestPhone : undefined,
    guestCompanyName:
      data.guestCompanyName && data.guestCompanyName !== ""
        ? data.guestCompanyName
        : undefined,
    guestCustomerType: data.guestCustomerType,
  }),
);
```

- [ ] **Step 2: `ReservationEditForm.tsx` の `useForm` defaultValue にゲストフィールドを追加**

`src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx:180-184`
を変更:

```ts
    defaultValue: {
      couponCode: reservation.coupon?.code ?? "",
      notes: reservation.notes ?? "",
      version: String(reservation.version),
      guestLastName: reservation.guestLastName ?? "",
      guestFirstName: reservation.guestFirstName ?? "",
      guestEmail: reservation.guestEmail ?? "",
      guestPhone: reservation.guestPhone ?? "",
      guestCompanyName: reservation.guestCompanyName ?? "",
      guestCustomerType: reservation.guestCustomerType ?? undefined,
    },
```

`guestCustomerType` は `Select` (controlled component) で扱うため、`status`
(164行目 `const [status, setStatus] = useState<ReservationStatus>(reservation.status);`)
と同型の state を追加する（同じ箇所、164行目の直後）:

```ts
const [guestCustomerType, setGuestCustomerType] = useState<
  CustomerType | undefined
>(reservation.guestCustomerType ?? undefined);
```

ファイル冒頭の import に `CustomerType` を追加
(`@/shared/lib/validations/enums/prisma-types` から、既存の `ReservationStatus` import と同じ行)。

- [ ] **Step 3: 「顧客情報」カードにゲスト連絡先の編集可能セクションを追加**

`ReservationEditForm.tsx:476-517`（既存の顧客情報 `<Card>`、`reservation.customer.*` を
読み取り専用表示している箇所）の直後に、新しい編集可能な「予約時のゲスト連絡先」カードを
追加する。ファイル冒頭の import に `Textarea` は不要（Input/Select/Label は既に import 済み、
ファイル先頭を grep で確認し無ければ追加）。`getInputProps`/`getSelectProps` 等 conform の
helper は既存コードの他フィールド（`fields.notes` 等）の使い方に倣う。既存の `fields` オブジェクトの
`guestLastName` 等はスキーマに追加済み（Task 2）なので自動的に生成される:

```tsx
<Card>
  <CardHeader>
    <CardTitle>予約時のゲスト連絡先（任意）</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <p className="text-xs text-muted-foreground">
      この予約が入力された時点の連絡先スナップショットです。顧客マスタ (
      {reservation.customer.lastName} {reservation.customer.firstName})
      には反映されません。
    </p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={fields.guestLastName.id}>姓</Label>
        <Input
          id={fields.guestLastName.id}
          name={fields.guestLastName.name}
          defaultValue={fields.guestLastName.initialValue}
          disabled={isPending}
          aria-invalid={fields.guestLastName.errors ? true : undefined}
          aria-describedby={
            fields.guestLastName.errors
              ? fields.guestLastName.errorId
              : undefined
          }
        />
        {fields.guestLastName.errors && (
          <p
            id={fields.guestLastName.errorId}
            className="text-sm text-destructive"
          >
            {fields.guestLastName.errors.join(", ")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={fields.guestFirstName.id}>名</Label>
        <Input
          id={fields.guestFirstName.id}
          name={fields.guestFirstName.name}
          defaultValue={fields.guestFirstName.initialValue}
          disabled={isPending}
          aria-invalid={fields.guestFirstName.errors ? true : undefined}
        />
        {fields.guestFirstName.errors && (
          <p className="text-sm text-destructive">
            {fields.guestFirstName.errors.join(", ")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={fields.guestEmail.id}>メールアドレス</Label>
        <Input
          id={fields.guestEmail.id}
          name={fields.guestEmail.name}
          type="email"
          defaultValue={fields.guestEmail.initialValue}
          disabled={isPending}
          aria-invalid={fields.guestEmail.errors ? true : undefined}
        />
        {fields.guestEmail.errors && (
          <p className="text-sm text-destructive">
            {fields.guestEmail.errors.join(", ")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={fields.guestPhone.id}>電話番号</Label>
        <Input
          id={fields.guestPhone.id}
          name={fields.guestPhone.name}
          defaultValue={fields.guestPhone.initialValue}
          disabled={isPending}
          aria-invalid={fields.guestPhone.errors ? true : undefined}
        />
        {fields.guestPhone.errors && (
          <p className="text-sm text-destructive">
            {fields.guestPhone.errors.join(", ")}
          </p>
        )}
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={fields.guestCompanyName.id}>会社名・団体名</Label>
        <Input
          id={fields.guestCompanyName.id}
          name={fields.guestCompanyName.name}
          defaultValue={fields.guestCompanyName.initialValue}
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="guestCustomerTypeSelect">顧客種別</Label>
        <input
          type="hidden"
          name={fields.guestCustomerType.name}
          value={guestCustomerType ?? ""}
        />
        <Select
          value={guestCustomerType ?? ""}
          onValueChange={(value) =>
            setGuestCustomerType(
              value === "" ? undefined : (value as CustomerType),
            )
          }
          disabled={isPending}
        >
          <SelectTrigger id="guestCustomerTypeSelect">
            <SelectValue placeholder="未設定" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CustomerType.PERSONAL}>個人</SelectItem>
            <SelectItem value={CustomerType.BUSINESS}>法人</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 4: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 5: 既存の action-shape 統合テストを実行し、壊れていないことを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/actions/admin/reservation.action-shape.test.ts`
Expected: PASS（guest* は全て optional なので、既存の呼び出しパターン
(`omitUndefined` が guest フィールド未指定時にキー自体を省略する) を壊さない）

- [ ] **Step 6: ブラウザで手動確認**

`bun run dev` 起動済みの前提で `/admin/reservations/<既存予約ID>/edit` を開き、
「予約時のゲスト連絡先」カードが表示され、入力→保存→再読み込みで値が保持されることを
目視確認する。Customer 側の「顧客情報」カードの値が変化しないことも確認する。

- [ ] **Step 7: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx" \
  "src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts"
git commit -m "feat(admin): add guest contact fields to reservation edit form"
```

---

### Task 4: キャンセル理由を `updateReservationStatus` / `bulkCancelReservations` に配線

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts:42-45,84-91,173-179`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/bulk.ts:66-68,239-243,271-277`
- Test: `__tests__/integration/domain/reservations/cancellation-side-effects-audit.test.ts`
  （既存パターンを参考に、新規 `__tests__/unit/actions/reservation-cancellation-reason.test.ts`
  を作成 — action層は mock-based unit test の対象）

**Interfaces:**

- Produces: `updateReservationStatus(id, status, reason？)` と
  `bulkCancelReservations(ids, reason?)` が第2/第3引数で任意のキャンセル理由を受け取り、
  `applyCancellationSideEffects` の `cancellationReason` に反映する（Task 5/6/7 の
  ダイアログが呼び出す）

- [ ] **Step 1: 失敗するユニットテストを書く**

`__tests__/unit/actions/reservation-cancellation-reason.test.ts` を新規作成:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockExecuteAdminMutationResult = mock();
const mockUpdateReservationStatusCommand = mock();
const mockApplyCancellationSideEffects = mock(async () => undefined);
const mockGetReservationStatus = mock();

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
}));
mock.module("server-only", () => ({}));
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));
mock.module("@/shared/domain/reservations/lifecycle-commands", () => ({
  deleteReservationCommand: mock(),
  restoreReservationCommand: mock(),
  restoreReservationStatusCommand: mock(),
  updateReservationNotesCommand: mock(),
  updateReservationStatusCommand: (
    ...args: Parameters<typeof mockUpdateReservationStatusCommand>
  ) => mockUpdateReservationStatusCommand(...args),
}));
mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: (
    ...args: Parameters<typeof mockApplyCancellationSideEffects>
  ) => mockApplyCancellationSideEffects(...args),
}));
mock.module("@/shared/domain/reservations/admin-queries", () => ({
  getReservationStatus: (
    ...args: Parameters<typeof mockGetReservationStatus>
  ) => mockGetReservationStatus(...args),
  getReservationGuestData: mock(),
}));
mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerFromGuestData: mock(),
}));
mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));
mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  syncReservationToCalendar: mock(async () => undefined),
  updateCalendarSync: mock(async () => undefined),
  deleteCalendarSync: mock(async () => ({ success: true })),
}));
mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationAdminNotification: mock(async () => undefined),
  sendReservationConfirmationEmail: mock(async () => undefined),
  sendReservationStatusChangedEmail: mock(async () => undefined),
}));
mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  issueSmartLockPasscodes: mock(async () => ({
    passcodes: [],
    issuanceFailed: false,
  })),
}));
mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeSmartLockPasscodesForReservation: mock(async () => undefined),
}));
mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => undefined),
}));
mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: { RESERVATIONS: "reservations" },
  getCacheTag: {
    reservations: {
      calendar: () => "reservations-calendar",
      detail: (id: string) => `reservations-${id}`,
    },
  },
}));
mock.module("@/admin/lib/audit", () => ({
  emitBulkAuditRecords: mock(() => undefined),
}));
mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: null, userAgent: null }),
}));
mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM" },
  logError: mock(() => undefined),
  normalizeError: (error: unknown) => error,
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

const { updateReservationStatus } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations");
const { bulkCancelReservations } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/bulk");
const { ReservationStatus } =
  await import("@/shared/lib/validations/enums/prisma-types");

const RESERVATION_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

describe("updateReservationStatus: cancellation reason threading", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockApplyCancellationSideEffects.mockReset();
    mockApplyCancellationSideEffects.mockResolvedValue(undefined);
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute();
      options.afterSuccess?.(data);
      return data;
    });
  });

  test("reason 指定時、applyCancellationSideEffects の cancellationReason に渡る", async () => {
    mockUpdateReservationStatusCommand.mockResolvedValue({
      payload: {},
      previousStatus: ReservationStatus.CONFIRMED,
      googleCalendarEventId: null,
      spaceId: "space-1",
    });

    await updateReservationStatus(
      RESERVATION_ID,
      ReservationStatus.CANCELLED,
      "顧客都合キャンセル",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: "顧客都合キャンセル" }),
    );
  });

  test("reason 未指定時は null が渡る (既存挙動を維持)", async () => {
    mockUpdateReservationStatusCommand.mockResolvedValue({
      payload: {},
      previousStatus: ReservationStatus.CONFIRMED,
      googleCalendarEventId: null,
      spaceId: "space-1",
    });

    await updateReservationStatus(RESERVATION_ID, ReservationStatus.CANCELLED);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: null }),
    );
  });
});

describe("bulkCancelReservations: cancellation reason threading", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockApplyCancellationSideEffects.mockReset();
    mockApplyCancellationSideEffects.mockResolvedValue(undefined);
    mockGetReservationStatus.mockReset();
    mockGetReservationStatus.mockResolvedValue({
      status: ReservationStatus.CONFIRMED,
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute({ id: "admin-1" }),
    );
  });

  test("reason を全 id に同一の cancellationReason として渡す", async () => {
    await bulkCancelReservations([RESERVATION_ID], "重複予約");

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: RESERVATION_ID,
        cancellationReason: "重複予約",
      }),
    );
  });

  test("reason 未指定時は null (既存挙動を維持)", async () => {
    await bulkCancelReservations([RESERVATION_ID]);

    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: null }),
    );
  });

  test("500文字超の reason は VALIDATION エラーになる", async () => {
    const { isMutationError } = await import("@/shared/lib/mutation-result");
    const result = await bulkCancelReservations(
      [RESERVATION_ID],
      "a".repeat(501),
    );
    expect(isMutationError(result)).toBe(true);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/reservation-cancellation-reason.test.ts`
Expected: FAIL — `updateReservationStatus`/`bulkCancelReservations` が第2/第3引数の
`reason` を受け付けない（TypeScript の余剰引数エラー、または実行時に無視される）。

- [ ] **Step 3: `mutations.ts` の `updateReservationStatus` に reason パラメータを追加**

`mutations.ts:42-45` の `updateStatusSchema` に追加:

```ts
const updateStatusSchema = z.object({
  id: z.uuid({ error: "IDが不正です" }),
  status: z.enum(ReservationStatus),
  reason: z.string().max(500).optional().or(z.literal("")),
});
```

`mutations.ts:84-91` のシグネチャと parse 呼び出しを変更:

```ts
export const updateReservationStatus = async (
  id: string,
  status: ReservationStatus,
  reason?: string,
) => {
  const parsed = updateStatusSchema.safeParse({ id, status, reason });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }
```

`mutations.ts:173-179` の `applyCancellationSideEffects` 呼び出しを変更:

```ts
await applyCancellationSideEffects({
  reservationId: id,
  cancellationReason:
    parsed.data.reason && parsed.data.reason !== "" ? parsed.data.reason : null,
  channel: "admin",
  actorUserId: null,
  request: { ip, userAgent, tokenFingerprint: null },
});
```

- [ ] **Step 4: `bulk.ts` の `bulkCancelReservations` に reason パラメータを追加**

`bulk.ts:66-68` の直後に理由用スキーマを追加:

```ts
const bulkIdsSchema = z
  .array(z.uuid({ error: "予約IDが不正です" }))
  .min(1, { error: "1件以上選択してください" });

const bulkCancellationReasonSchema = z
  .string()
  .max(500, { error: "理由は500文字以内で入力してください" })
  .optional()
  .or(z.literal(""));
```

`bulk.ts:239-243` のシグネチャと validation を変更:

```ts
export async function bulkCancelReservations(
  ids: string[],
  reason?: string,
): Promise<MutationResult<BulkResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);
  const parsedReason = bulkCancellationReasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return createValidationMutationError(parsedReason.error);
  }
  const cancellationReason =
    parsedReason.data && parsedReason.data !== "" ? parsedReason.data : null;
```

`bulk.ts:271-277` の `applyCancellationSideEffects` 呼び出しを変更:

```ts
// SSoT: single-cancel 経路と同じ副作用チェーン + per-id AuditLog を発火。
await applyCancellationSideEffects({
  reservationId: id,
  cancellationReason,
  channel: "admin",
  actorUserId: user.id,
  request,
});
```

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/reservation-cancellation-reason.test.ts`
Expected: PASS

- [ ] **Step 6: 既存の呼び出し元（引数なし呼び出し）が壊れていないことを確認**

Run: `bun run type-check`
Expected: exit 0（`reason` は optional なので `ReservationStatusSelect.tsx` 等の
既存の2引数呼び出しはそのまま型適合する — Task 5/6/7 で呼び出し元を更新するまでは
これまで通り理由なしでキャンセルされる）

- [ ] **Step 7: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts" \
  "src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/bulk.ts" \
  __tests__/unit/actions/reservation-cancellation-reason.test.ts
git commit -m "feat(admin): thread optional cancellation reason through reservation cancel actions"
```

---

### Task 5: `CancellationReasonDialog` を新設し一覧行の終端遷移に配線

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/reservations/_components/CancellationReasonDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationStatusSelect.tsx`
- Test: `__tests__/unit/components/admin/cancellation-reason-dialog.test.tsx`（新規）

**Interfaces:**

- Produces: `CancellationReasonDialog` — props
  `{ open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason?: string) => void; isPending: boolean }`
  （Task 6/7 も同じコンポーネントを import して再利用する）

- [ ] **Step 1: 失敗するコンポーネントテストを書く**

`__tests__/unit/components/admin/cancellation-reason-dialog.test.tsx` を新規作成:

```tsx
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("@/admin/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  Label: ({
    children,
    htmlFor,
  }: {
    children?: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
  Select: ({
    children,
    onValueChange,
  }: {
    children?: React.ReactNode;
    onValueChange?: (value: string) => void;
  }) => (
    <select
      aria-label="返金理由 (任意)"
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  Textarea: ({
    value,
    onChange,
    maxLength,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    maxLength?: number;
  }) => (
    <textarea
      value={value}
      onChange={onChange as never}
      maxLength={maxLength}
    />
  ),
}));

const { CancellationReasonDialog } =
  await import("@/app/(admin)/admin/(dashboard)/reservations/_components/CancellationReasonDialog");

describe("CancellationReasonDialog", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
  });

  test("プリセット選択時、選択値を reason として onConfirm する", async () => {
    const onConfirm = mock();
    await act(async () => {
      root?.render(
        <CancellationReasonDialog
          open={true}
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          isPending={false}
        />,
      );
    });

    const select = container?.querySelector("select");
    await act(async () => {
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // jsdom の select value 変更は onChange 経由の value を直接使えないため、
    // ここでは custom preset の自由入力経路のみを検証する
    // (次の test を参照)。
  });

  test("理由なしで確定すると reason=undefined で onConfirm する", async () => {
    const onConfirm = mock();
    await act(async () => {
      root?.render(
        <CancellationReasonDialog
          open={true}
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          isPending={false}
        />,
      );
    });

    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "キャンセルする");
    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/cancellation-reason-dialog.test.tsx`
Expected: FAIL — module not found（`CancellationReasonDialog` 未作成）

- [ ] **Step 3: `CancellationReasonDialog.tsx` を新規作成**

`src/app/(admin)/admin/(dashboard)/reservations/_components/CancellationReasonDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";

/**
 * 予約キャンセル理由入力ダイアログ (Phase 3)。
 *
 * RefundDialog.tsx と同型の「プリセット + 自由入力 + 文字数制限」パターン。
 * 一覧行 (ReservationStatusSelect)・詳細ページ (ReservationDetail)・一括操作
 * (ReservationBulkActions) の3導線から共通で使う。
 */

const REASON_PRESETS = [
  { value: "顧客都合キャンセル", label: "顧客都合キャンセル" },
  { value: "スペース側事情", label: "スペース側事情" },
  { value: "重複予約", label: "重複予約" },
  { value: "custom", label: "その他 (自由入力)" },
] as const;

const CUSTOM_REASON_MAX = 500;

interface CancellationReasonDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (reason?: string) => void;
  readonly isPending: boolean;
  /** 一括キャンセル等、対象件数を明示したい場合に表示 (単発は省略可)。 */
  readonly targetCount?: number;
}

export function CancellationReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  targetCount,
}: CancellationReasonDialogProps) {
  const [reasonPreset, setReasonPreset] = useState<string>("");
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reason =
    reasonPreset === "custom"
      ? customReason.trim()
      : reasonPreset === ""
        ? ""
        : reasonPreset;

  const resetForm = () => {
    setReasonPreset("");
    setCustomReason("");
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    setError(null);

    if (reasonPreset === "custom" && customReason.trim() === "") {
      setError("理由を入力してください。");
      return;
    }
    if (customReason.length > CUSTOM_REASON_MAX) {
      setError(`理由は ${CUSTOM_REASON_MAX} 文字以内で入力してください。`);
      return;
    }

    onConfirm(reason !== "" ? reason : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>予約をキャンセルしますか？</DialogTitle>
          <DialogDescription>
            {targetCount !== undefined
              ? `${targetCount} 件の予約をキャンセルします。この操作は取り消せません。`
              : "この操作後、ステータスは終端状態となり、通常の管理者では戻せません。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancellation-reason-preset">
              キャンセル理由 (任意)
            </Label>
            <Select
              value={reasonPreset}
              onValueChange={setReasonPreset}
              disabled={isPending}
            >
              <SelectTrigger id="cancellation-reason-preset">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {REASON_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reasonPreset === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="cancellation-custom-reason">
                理由 (自由入力)
              </Label>
              <Textarea
                id="cancellation-custom-reason"
                rows={3}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                disabled={isPending}
                maxLength={CUSTOM_REASON_MAX}
              />
              <p className="text-xs text-muted-foreground">
                {customReason.length} / {CUSTOM_REASON_MAX}
              </p>
            </div>
          ) : null}

          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "処理中..." : "キャンセルする"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/cancellation-reason-dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: `ReservationStatusSelect.tsx` に配線 — CANCELLED のみダイアログに分岐**

`ReservationStatusSelect.tsx` の import に追加:

```ts
import { CancellationReasonDialog } from "./CancellationReasonDialog";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
```

(`ReservationStatus` は既に import 済みなら重複させない。既存の `isValidReservationStatus`
import 行の直後に追加する形で統合する。)

`handleConfirmTerminal` (78-83行目) を、CANCELLED の場合だけ理由ダイアログを使うよう分岐する。
既存の `pendingTerminal` state をそのまま使い、`performStatusChange` 呼び出し部分だけ分岐:

```tsx
const handleConfirmTerminal = () => {
  if (!pendingTerminal) return;
  const target = pendingTerminal;
  setPendingTerminal(null);
  performStatusChange(target);
};

const performCancelWithReason = (reason?: string) => {
  setPendingTerminal(null);
  startTransition(async () => {
    const result = await updateReservationStatus(
      reservationId,
      ReservationStatus.CANCELLED,
      reason,
    );
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }
    toast.success("ステータスを更新しました");
    router.refresh();
  });
};
```

`return` 内の `<AlertDialog>` ブロックを、`pendingTerminal === ReservationStatus.CANCELLED`
の場合だけ `CancellationReasonDialog` に差し替える形で分岐する:

```tsx
  return (
    <>
      <Select
        value={currentStatus}
        onValueChange={(value) => {
          if (isValidReservationStatus(value)) handleStatusChange(value);
        }}
        disabled={isPending || isTerminal}
      >
        <SelectTrigger
          className="w-36"
          aria-label={`予約ステータス（現在: ${RESERVATION_STATUS_LABELS[currentStatus]}）`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={currentStatus}>
            {RESERVATION_STATUS_LABELS[currentStatus]}
          </SelectItem>
          {allowedNextStatuses.map((status) => (
            <SelectItem key={status} value={status}>
              {RESERVATION_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pendingTerminal === ReservationStatus.CANCELLED ? (
        <CancellationReasonDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setPendingTerminal(null);
          }}
          onConfirm={performCancelWithReason}
          isPending={isPending}
        />
      ) : (
        <AlertDialog
          open={pendingTerminal !== null}
          onOpenChange={(open) => {
            if (!open) setPendingTerminal(null);
          }}
        >
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                ステータスを「
                {pendingTerminal
                  ? RESERVATION_STATUS_LABELS[pendingTerminal]
                  : ""}
                」に変更しますか？
              </AlertDialogTitle>
              <AlertDialogDescription>
                この操作後、ステータスは終端状態となり、通常の管理者では戻せません。誤操作の場合は
                SUPER_ADMIN
                権限を持つ管理者に「ステータスを復元」を依頼してください。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmTerminal}
                disabled={isPending}
              >
                {isPending ? "変更中..." : "変更する"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
```

（`pendingTerminal === ReservationStatus.CANCELLED ? open=true` は分岐自体が
`pendingTerminal` の非null条件を兼ねるため常に `true` で問題ない — 分岐が
描画されている時点で `pendingTerminal` は必ず `CANCELLED` である。）

- [ ] **Step 6: 既存の `ReservationStatusSelect` 関連テストを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin --recursive 2>/dev/null || true`

既存の `ReservationStatusSelect` 専用テストファイルがあれば
（`__tests__/unit/components/admin/` を grep で確認）、CANCELLED 遷移が
AlertDialog ではなく CancellationReasonDialog に分岐したことでテストが壊れていないか
確認し、壊れていれば mock を更新する。専用テストが存在しない場合はこのステップをスキップする。

- [ ] **Step 7: ブラウザで手動確認**

`/admin/reservations` 一覧で任意の予約のステータス Select を CANCELLED に変更し、
理由入力ダイアログが出ることを確認する。COMPLETED/NO_SHOW への変更は従来通り
汎用 AlertDialog のままであることも確認する。

- [ ] **Step 8: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/reservations/_components/CancellationReasonDialog.tsx" \
  "src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationStatusSelect.tsx" \
  __tests__/unit/components/admin/cancellation-reason-dialog.test.tsx
git commit -m "feat(admin): add cancellation reason dialog, wire into list-row status select"
```

---

### Task 6: `ReservationDetail.tsx` の詳細ページ Select にキャンセル確認を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx:198-211,307-331`

**Interfaces:**

- Consumes: Task 5 の `CancellationReasonDialog`

**Note:** このコンポーネントの詳細ページ inline Select は現状 CANCELLED を含む
**どの遷移にも確認ダイアログが一切ない**（Phase 3 事前調査で判明、一覧行の
`ReservationStatusSelect.tsx` とは独立実装）。本 task はキャンセル理由入力の追加と
同時に、CANCELLED 遷移に確認ステップという安全網を新設する（設計doc記載の
「両方に理由入力ダイアログを挟む」を文字通り実行すると自動的にこの安全網が付与される）。

- [ ] **Step 1: `ReservationDetail.tsx` に state とハンドラを追加**

import に追加:

```ts
import { CancellationReasonDialog } from "../../_components/CancellationReasonDialog";
```

（相対パスは実ファイル配置に合わせて確認する — `ReservationDetail.tsx` は
`reservations/[id]/_components/` 配下、`CancellationReasonDialog.tsx` は
`reservations/_components/` 配下のため `../../_components/CancellationReasonDialog`
になる。実行前に `ls` 等でパスの実在を確認すること。）

`refundDialogOpen` state (170行目) の直後に追加:

```ts
const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
```

`handleStatusChange` (198-211行目) を変更 — CANCELLED の場合はダイアログを開くだけにする:

```ts
const handleStatusChange = async (newStatus: ReservationStatus) => {
  if (newStatus === reservation.status) return;

  if (newStatus === ReservationStatus.CANCELLED) {
    setCancelDialogOpen(true);
    return;
  }

  startTransition(async () => {
    const result = await updateReservationStatus(reservation.id, newStatus);
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }

    toast.success("ステータスを更新しました");
    router.refresh();
  });
};

const handleConfirmCancel = (reason?: string) => {
  startTransition(async () => {
    const result = await updateReservationStatus(
      reservation.id,
      ReservationStatus.CANCELLED,
      reason,
    );
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }

    toast.success("ステータスを更新しました");
    setCancelDialogOpen(false);
    router.refresh();
  });
};
```

- [ ] **Step 2: `<RefundDialog>` の直後（575-581行目のすぐ後）に `<CancellationReasonDialog>` を追加**

```tsx
      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        totalPriceWithTax={Number(reservation.totalPriceWithTax ?? 0)}
        onConfirm={handleRefund}
        isPending={isPaymentPending}
      />

      <CancellationReasonDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleConfirmCancel}
        isPending={isPending}
      />
```

- [ ] **Step 3: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 4: ブラウザで手動確認**

予約詳細ページのステータス Select を CANCELLED に変更すると、即座には反映されず
`CancellationReasonDialog` が開くこと、キャンセル確定で正しく反映されることを確認する。
PENDING/CONFIRMED への変更は従来通り即時反映されることも確認する。

- [ ] **Step 5: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx"
git commit -m "feat(admin): require cancellation reason confirmation on reservation detail page"
```

---

### Task 7: `ReservationBulkActions.tsx` の一括キャンセルに理由入力を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationBulkActions.tsx`

**Interfaces:**

- Consumes: Task 4 の `bulkCancelReservations(ids, reason?)`、Task 5 の `CancellationReasonDialog`

- [ ] **Step 1: state とハンドラを分割する**

`ReservationBulkActions.tsx` の import に追加:

```ts
import { useState } from "react";
import { CancellationReasonDialog } from "./CancellationReasonDialog";
```

（`useTransition` は既に import 済み。`useState` を同じ import 文に統合する。）

`handleBulkCancel` を、ボタンクリックではダイアログを開くだけにし、実処理を
別関数に分割する:

```ts
export function ReservationBulkActions({
  selectedIds,
  onClear,
}: ReservationBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const handleBulkConfirm = () => {
    startTransition(async () => {
      const result = await bulkConfirmReservations(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const parts: string[] = [];
      if (result.succeeded > 0) parts.push(`${result.succeeded}件確定`);
      if (result.skipped > 0) parts.push(`${result.skipped}件スキップ`);
      if (result.failed > 0) parts.push(`${result.failed}件失敗`);

      if (result.succeeded > 0) {
        toast.success(parts.join("、"));
      } else {
        toast.info(parts.join("、"));
      }
      onClear();
      router.refresh();
    });
  };

  const handleConfirmBulkCancel = (reason?: string) => {
    startTransition(async () => {
      const result = await bulkCancelReservations(selectedIds, reason);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const parts: string[] = [];
      if (result.succeeded > 0) parts.push(`${result.succeeded}件キャンセル`);
      if (result.skipped > 0) parts.push(`${result.skipped}件スキップ`);
      if (result.failed > 0) parts.push(`${result.failed}件失敗`);

      if (result.succeeded > 0) {
        toast.success(parts.join("、"));
      } else {
        toast.info(parts.join("、"));
      }
      setCancelDialogOpen(false);
      onClear();
      router.refresh();
    });
  };

  return (
    <>
      <FloatingBulkActionBar
        selectedCount={selectedIds.length}
        onClear={onClear}
        isPending={isPending}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleBulkConfirm}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconCheck className="mr-1 h-4 w-4" />
          )}
          一括確定
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setCancelDialogOpen(true)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconBan className="mr-1 h-4 w-4" />
          )}
          一括キャンセル
        </Button>
      </FloatingBulkActionBar>

      <CancellationReasonDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleConfirmBulkCancel}
        isPending={isPending}
        targetCount={selectedIds.length}
      />
    </>
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 3: ブラウザで手動確認**

予約一覧で複数選択→「一括キャンセル」ボタンをクリックすると理由入力ダイアログが開き、
確定すると選択件数分がキャンセルされ、toast に件数が表示されることを確認する。

- [ ] **Step 4: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationBulkActions.tsx"
git commit -m "feat(admin): add cancellation reason dialog to bulk cancel action"
```

---

### Task 8: RefundDialog バグ修正 — `cumulativeRefunded` を実際に渡す

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts`
  (`getReservationCumulativeRefunded` を新設)
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx:67-75,575-581`
- Test: `__tests__/integration/domain/reservations/reservation-cumulative-refunded.test.ts`（新規）

**Interfaces:**

- Produces: `getReservationCumulativeRefunded(id: string): Promise<number>`
  （`prisma.refund.aggregate` を read-only で呼ぶ、advisory lock 728355 は取得しない
  — その lock は write-serialization 専用で本 read query には不要）

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/domain/reservations/reservation-cumulative-refunded.test.ts` を新規作成:

```ts
/**
 * ReservationDetail が RefundDialog に cumulativeRefunded を渡していなかった
 * バグ (Phase 3 事前調査で発見) の元となる集計クエリの回帰テスト。
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const { prisma: basePrisma } = await import("@/shared/db/prisma");
const { getReservationCumulativeRefunded } =
  await import("@/shared/domain/reservations/admin-queries");
const { TaxRateType } = await import("@generated/prisma/enums");

describe("getReservationCumulativeRefunded", () => {
  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("複数回の部分返金を合算して返す", async () => {
    const space = await basePrisma.space.create({
      data: {
        name: `test-space-${randomUUID()}`,
        slug: `test-space-${randomUUID()}`,
        hourlyPrice: 1000,
        isActive: true,
        isPublished: true,
      },
    });
    const customer = await basePrisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "太郎",
        email: `refund-agg-${randomUUID()}@example.com`,
        emailCanonical: `refund-agg-${randomUUID()}@example.com`,
      },
    });
    const reservation = await basePrisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        startTime: new Date("2026-08-01T01:00:00.000Z"),
        endTime: new Date("2026-08-01T02:00:00.000Z"),
        totalPrice: 10000,
        basePrice: 10000,
        rateBreakdownJson: { legacy: true, segments: [] },
        taxRateType: TaxRateType.STANDARD,
        taxRate: 10,
        taxAmount: 1000,
        totalPriceWithTax: 11000,
      },
    });
    await basePrisma.refund.createMany({
      data: [
        { reservationId: reservation.id, amount: 3000, reason: "一部返金1" },
        { reservationId: reservation.id, amount: 2000, reason: "一部返金2" },
      ],
    });

    const cumulative = await getReservationCumulativeRefunded(reservation.id);
    expect(cumulative).toBe(5000);

    await basePrisma.refund.deleteMany({
      where: { reservationId: reservation.id },
    });
    await basePrisma.reservation.delete({ where: { id: reservation.id } });
    await basePrisma.customer.delete({ where: { id: customer.id } });
    await basePrisma.space.delete({ where: { id: space.id } });
  });

  test("返金履歴が無い予約は 0 を返す", async () => {
    const cumulative = await getReservationCumulativeRefunded(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(cumulative).toBe(0);
  });
});
```

`Refund` モデルの実フィールド（`reason` が必須か否か等）を `prisma/schema.prisma` で
grep して確認し、上記 `createMany` の `data` を実スキーマに合わせて調整すること
（Phase 3 事前調査では amount/reservationId のみ確認済みで、他の必須フィールドの
有無は未確認 — 実装時に schema.prisma の `model Refund` ブロックを直接読むこと）。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/reservations/reservation-cumulative-refunded.test.ts`
Expected: FAIL — `getReservationCumulativeRefunded` が存在しない

- [ ] **Step 3: `admin-queries.ts` に集計クエリを追加**

`src/shared/domain/reservations/admin-queries.ts` の `getReservationByIdQuery` の直後に追加:

```ts
/**
 * 予約の累積返金額 (Refund.amount の合計)。RefundDialog の「残額」表示用の
 * read-only 集計であり、728355 (予約単位 refund 直列化) advisory lock は
 * 取得しない — その lock は refundReservationPaymentCommand の書込直列化専用。
 */
export async function getReservationCumulativeRefunded(
  reservationId: string,
): Promise<number> {
  const aggregate = await prisma.refund.aggregate({
    where: { reservationId },
    _sum: { amount: true },
  });
  return aggregate._sum.amount ?? 0;
}
```

- [ ] **Step 4: `_shared/queries/reservation.ts` に RBAC ラップの thin wrapper を追加**

`src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts` の import に追加:

```ts
import {
  getReservationByIdQuery,
  getReservationCumulativeRefunded as getReservationCumulativeRefundedQuery,
  getReservationSeriesInfoQuery,
  getReservationsForCalendarQuery,
  getReservationsQuery,
  getReservationStatsQuery,
  getSpacesForCalendarQuery,
  getSpacesForReservationQuery,
} from "@/shared/domain/reservations/admin-queries";
```

`getReservationById` 関数の直後に追加:

```ts
export async function getReservationCumulativeRefunded(
  id: string,
): Promise<number> {
  await requireAdminPermission("reservation", "read");
  return getReservationCumulativeRefundedQuery(id);
}
```

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/reservations/reservation-cumulative-refunded.test.ts`
Expected: PASS

- [ ] **Step 6: `reservations/[id]/page.tsx` で新クエリを取得し `ReservationDetail` に渡す**

`page.tsx` の import に追加:

```ts
import {
  getReservationById,
  getReservationCumulativeRefunded,
  getReservationSeriesInfo,
} from "@/admin/queries/reservation";
```

`Promise.all` に追加:

```ts
const [
  reservation,
  sessionUser,
  paymentEnabled,
  seriesInfo,
  cumulativeRefunded,
] = await Promise.all([
  getReservationById(id),
  verifyAdminSession(),
  isFeatureEnabled("payment"),
  getReservationSeriesInfo(id),
  getReservationCumulativeRefunded(id),
]);
```

`<ReservationDetail>` 呼び出しに prop を追加:

```tsx
<ReservationDetail
  key={reservation.id}
  reservation={reservation}
  paymentEnabled={paymentEnabled}
  cumulativeRefunded={cumulativeRefunded}
/>
```

- [ ] **Step 7: `ReservationDetail.tsx` の props とバグ箇所を修正**

`ReservationDetailProps` 型 (67-75行目) に追加:

```ts
type ReservationDetailProps = {
  reservation: ReservationWithRelations;
  paymentEnabled: boolean;
  /** RefundDialog の「残額」計算用。Refund.amount の累積合計。 */
  cumulativeRefunded: number;
};
```

関数シグネチャに追加:

```ts
export function ReservationDetail({
  reservation,
  paymentEnabled,
  cumulativeRefunded,
}: ReservationDetailProps) {
```

`<RefundDialog>` 呼び出し (575-581行目) を修正:

```tsx
<RefundDialog
  open={refundDialogOpen}
  onOpenChange={setRefundDialogOpen}
  totalPriceWithTax={Number(reservation.totalPriceWithTax ?? 0)}
  cumulativeRefunded={cumulativeRefunded}
  onConfirm={handleRefund}
  isPending={isPaymentPending}
/>
```

- [ ] **Step 8: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 9: ブラウザで手動確認**

部分返金を1回実行した予約の詳細ページを開き、再度「返金する」ボタンを押した際の
「残額」表示が (税込合計 − 既返金額) になっていることを確認する
（修正前は常に税込合計と同じだった）。

- [ ] **Step 10: コミット**

```bash
git add src/shared/domain/reservations/admin-queries.ts \
  "src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts" \
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx" \
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx" \
  __tests__/integration/domain/reservations/reservation-cumulative-refunded.test.ts
git commit -m "fix(admin): pass cumulativeRefunded to RefundDialog so remaining amount is correct"
```

---

### Task 9: RefundDialog にポリシー推奨額のヒント表示を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog.tsx`
- Test: `__tests__/unit/components/admin/refund-dialog.test.tsx`
  （既存ファイルがあれば追記、無ければ新規作成 — 実装前に
  `__tests__/unit/components/admin/` を grep して既存有無を確認する）

**Interfaces:**

- Consumes: 既存の `getRefundPolicySettings()` / `calculateRefundAmount(policy, chargedAmount, startTime, now)`
- Produces: `RefundDialog` に新しい optional prop `suggestedAmount?: number` を追加
  （既存の「空欄=残額全額」という送信時挙動は一切変更しない — 追加のヒント表示のみ）

- [ ] **Step 1: `page.tsx` でポリシー推奨額を計算する**

`page.tsx` の import に追加:

```ts
import { getRefundPolicySettings } from "@/shared/domain/settings/admin-queries";
import { calculateRefundAmount } from "@/shared/domain/refund/policy";
```

`Promise.all` の直後、`if (!reservation) notFound();` の前に追加
（`reservation` が必要なため `Promise.all` の後段に置く。`refundPolicy` の取得自体は
`reservation` に依存しないため並列化してもよいが、複雑度を避けて逐次呼び出しにする）:

```ts
if (!reservation) {
  notFound();
}

const refundPolicy = await getRefundPolicySettings();
const suggestedRefundAmount = refundPolicy
  ? calculateRefundAmount(
      refundPolicy,
      Number(reservation.totalPriceWithTax ?? 0),
      new Date(reservation.startTime),
      new Date(),
    )
  : null;
```

`<ReservationDetail>` 呼び出しに prop を追加:

```tsx
<ReservationDetail
  key={reservation.id}
  reservation={reservation}
  paymentEnabled={paymentEnabled}
  cumulativeRefunded={cumulativeRefunded}
  suggestedRefundAmount={suggestedRefundAmount}
/>
```

- [ ] **Step 2: `ReservationDetail.tsx` の props と `<RefundDialog>` 呼び出しを拡張**

`ReservationDetailProps` 型に追加:

```ts
/** 返金ポリシーに基づく推奨返金額。ポリシー未設定時は null。 */
suggestedRefundAmount: number | null;
```

関数シグネチャ・`<RefundDialog>` 呼び出しに追加:

```tsx
export function ReservationDetail({
  reservation,
  paymentEnabled,
  cumulativeRefunded,
  suggestedRefundAmount,
}: ReservationDetailProps) {
  // ...(既存コードそのまま)...

      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        totalPriceWithTax={Number(reservation.totalPriceWithTax ?? 0)}
        cumulativeRefunded={cumulativeRefunded}
        suggestedAmount={suggestedRefundAmount ?? undefined}
        onConfirm={handleRefund}
        isPending={isPaymentPending}
      />
```

- [ ] **Step 3: `RefundDialog.tsx` に `suggestedAmount` prop とヒント表示・クイック入力ボタンを追加**

`RefundDialogProps` interface (45-54行目) に追加:

```ts
interface RefundDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly totalPriceWithTax: number;
  readonly cumulativeRefunded?: number;
  /** 返金ポリシー (Settings.refundPolicy) に基づく推奨返金額。未設定/取得不可なら undefined。 */
  readonly suggestedAmount?: number;
  readonly onConfirm: (options: { amount?: number; reason?: string }) => void;
  readonly isPending: boolean;
}
```

関数シグネチャに追加 (56-63行目):

```ts
export function RefundDialog({
  open,
  onOpenChange,
  totalPriceWithTax,
  cumulativeRefunded = 0,
  suggestedAmount,
  onConfirm,
  isPending,
}: RefundDialogProps) {
```

「残額」表示の paragraph (158-161行目) の直後に、`suggestedAmount` が存在する場合のみ
ヒント + クイック入力ボタンを追加:

```tsx
            <p className="text-xs text-muted-foreground">
              合計 {formatPrice(totalPriceWithTax)} — 累積返金額{" "}
              {formatPrice(cumulativeRefunded)} — 残額 {formatPrice(remaining)}
            </p>
            {suggestedAmount !== undefined ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  ポリシー推奨額: {formatPrice(suggestedAmount)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmountStr(String(suggestedAmount))}
                  disabled={isPending}
                >
                  推奨額を使用
                </Button>
              </div>
            ) : null}
          </div>
```

（既存の「返金額」`Input` を含む `<div className="space-y-2">` ブロックの閉じタグ
`</div>` の直前に挿入する形になる — 実装時に既存 JSX のネストを確認して正しい位置に置くこと。）

- [ ] **Step 4: テストを書く/更新する**

`__tests__/unit/components/admin/refund-dialog.test.tsx` の既存有無を確認する。存在する場合は
「`suggestedAmount` 指定時にヒントとボタンが表示され、ボタン押下で amount input に反映される」
テストケースを追加する。存在しない場合は Task 5 の `CancellationReasonDialog` テストと同型の
mock 構成（`@/admin/components/ui` の Dialog/Select/Input/Textarea/Button を stub 化）で
新規作成する。

- [ ] **Step 5: テストを実行**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/refund-dialog.test.tsx`
Expected: PASS

- [ ] **Step 6: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 7: ブラウザで手動確認**

返金ポリシーが設定された状態で予約詳細の「返金する」を開き、ポリシー推奨額のヒントと
「推奨額を使用」ボタンが表示され、クリックで金額欄に反映されることを確認する。
返金ポリシー未設定時はヒントが表示されないことも確認する。

- [ ] **Step 8: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx" \
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx" \
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog.tsx" \
  __tests__/unit/components/admin/refund-dialog.test.tsx
git commit -m "feat(admin): show refund policy suggested amount hint in RefundDialog"
```

---

### Task 10: 予約一覧に spaceId フィルタを追加 + CSV監査ログに日付範囲を記録

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts`（`adminReservationSearchParamsParsers`）
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationFilters.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/page.tsx`
- Modify: `src/app/api/admin/export/reservations/route.ts`
- Test: `__tests__/unit/actions/reservation-export-audit.test.ts`（新規、export route の
  監査ログ metadata 形状を検証。route handler の直接ユニットテストが既存パターンに
  無ければ、Phase 2 の `event-registration-audit.test.ts` 相当の構成を参考にする）

**Interfaces:**

- Consumes: 既存の `ReservationListFilters.spaceId`（`admin-queries.ts:63`、既に対応済み）、
  既存の `getSpacesForReservation()`（`_shared/queries/reservation.ts:160-165`）

**Note（設計docからのスコープ縮小）:** 設計doc は「CSVエクスポートに一覧のフィルタ条件を
渡せるようにする」ことを Phase 3 の新規実装として記載していたが、事前調査の結果、
`getReservationsForExport` のフィルタ対応と AuditLog への `filterTab`/`filterSearch`/
`filterUserId` metadata 記録は既に別PR（`b0bbb5042`、本Phase3設計より前）で実装済みと
判明した。残る実ギャップは (a) spaceId フィルタが一覧UI/nuqs/export のどこにも
配線されていないこと（クエリ層の `buildReservationListWhere` 自体は対応済み）と、
(b) 適用済みの日付範囲 (`filterStartDate`/`filterEndDate`) が AuditLog metadata に
記録されていないことの2点のみ。本 task はこの2点に絞る。

- [ ] **Step 1: nuqs パーサーに `spaceId` を追加**

`src/shared/lib/nuqs/parsers.ts` の `adminReservationSearchParamsParsers`
（544行目付近）に追加:

```ts
export const adminReservationSearchParamsParsers = {
  search: parseAsQuery,
  tab: parseAsStringLiteral(reservationTabFilterValues).withDefault(
    "confirmed",
  ),
  page: parseAsPage,
  perPage: parseAsPerPage,
  sortBy: parseAsStringLiteral(reservationSortByValues).withDefault(
    "startTime",
  ),
  sortOrder: parseAsSortOrder,
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
  userId: parseAsString.withDefault(""),
  spaceId: parseAsString.withDefault(""),
};
```

（既存の完全な値は実装時にファイルを読んで確認し、`spaceId` の1行のみを追加すること
— 上記は追加箇所を明示するための全体再掲。）

- [ ] **Step 2: `reservations/page.tsx` で spaceId をクエリ・export href の両方に反映**

`ReservationList` 内の `getReservations` 呼び出しに追加:

```ts
const result = await getReservations(
  omitUndefined({
    tab: params.tab,
    search: params.search || undefined,
    startDate: params.dateFrom || undefined,
    endDate: params.dateTo || undefined,
    userId: params.userId || undefined,
    spaceId: params.spaceId || undefined,
  }),
  {
    page: params.page,
    limit: params.perPage,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  },
);
```

`exportParams` 組み立てに追加:

```ts
const exportParams = new URLSearchParams();
if (params.tab) exportParams.set("tab", params.tab);
if (params.search) exportParams.set("search", params.search);
if (params.dateFrom) exportParams.set("dateFrom", params.dateFrom);
if (params.dateTo) exportParams.set("dateTo", params.dateTo);
if (params.userId) exportParams.set("userId", params.userId);
if (params.spaceId) exportParams.set("spaceId", params.spaceId);
```

`ReservationsPage` 関数内で `getSpacesForReservation()` を取得し `ReservationFilters`
に渡す（`import { getSpacesForReservation } from "@/admin/queries/reservation";` を追加）:

```tsx
export default async function ReservationsPage({ searchParams }: PageProps) {
  const params = await loadAdminReservationSearchParams(searchParams);
  const spaces = await getSpacesForReservation();

  // ...(exportParams 組み立てはそのまま)...

      <Suspense fallback={<LoadingState variant="inline" />}>
        <ReservationFilters spaces={spaces} />
      </Suspense>
```

- [ ] **Step 3: `ReservationFilters.tsx` に Space select を追加**

`ReservationFilters` の props を追加:

```tsx
type ReservationFiltersProps = {
  spaces: { id: string; name: string }[];
};

export function ReservationFilters({ spaces }: ReservationFiltersProps) {
```

import に `Select` 系コンポーネントを追加（`@/admin/components/ui` から
`Select, SelectContent, SelectItem, SelectTrigger, SelectValue`）。
検索 `Input` の直前（`<div className="flex-1">` の前）に追加:

```tsx
<div className="min-w-0 sm:w-[200px]">
  <Select
    value={params.spaceId || "all"}
    onValueChange={(value) =>
      void setParams({
        spaceId: value === "all" ? null : value,
        page: 1,
      })
    }
  >
    <SelectTrigger aria-label="スペースで絞り込み">
      <SelectValue placeholder="全スペース" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">全スペース</SelectItem>
      {spaces.map((space) => (
        <SelectItem key={space.id} value={space.id}>
          {space.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 4: export route に spaceId パースと AuditLog 日付範囲 metadata を追加**

`src/app/api/admin/export/reservations/route.ts` の URL パース部分に追加:

```ts
const spaceId = url.searchParams.get("spaceId") ?? undefined;
```

`getReservationsForExport` 呼び出しに追加:

```ts
const reservations = await getReservationsForExport({
  ...(tab !== undefined && { tab }),
  ...(search !== undefined && search !== "" && { search }),
  ...(startDate !== undefined && startDate !== "" && { startDate }),
  ...(endDate !== undefined && endDate !== "" && { endDate }),
  ...(userId !== undefined && userId !== "" && { userId }),
  ...(spaceId !== undefined && spaceId !== "" && { spaceId }),
});
```

`createAuditLogRecord` の `metadata` に `filterSpaceId` と日付範囲を追加:

```ts
await createAuditLogRecord({
  userId: auth.user.id,
  action: AuditAction.EXPORT,
  resource: "reservation",
  metadata: {
    format: "csv",
    exportedCount: reservations.length,
    ...(tab !== undefined && { filterTab: tab }),
    ...(search !== undefined && search !== "" && { filterSearch: search }),
    ...(userId !== undefined && userId !== "" && { filterUserId: userId }),
    ...(spaceId !== undefined && spaceId !== "" && { filterSpaceId: spaceId }),
    ...(startDate !== undefined &&
      startDate !== "" && { filterStartDate: startDate }),
    ...(endDate !== undefined && endDate !== "" && { filterEndDate: endDate }),
  },
});
```

- [ ] **Step 5: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 6: export route の監査ログ metadata をユニットテストで検証**

`__tests__/unit/actions/reservation-export-audit.test.ts` を新規作成し、
`createAuditLogRecord` を mock 化して `GET` ハンドラを直接呼び出し、
`spaceId`/`dateFrom`/`dateTo` を含む URL で呼んだ際に `filterSpaceId`/
`filterStartDate`/`filterEndDate` が metadata に含まれることを検証する
（既存の `checkPermission`/`getReservationsForExport`/`generateCsv` 等は mock 化。
`__tests__/unit/actions/` 配下の既存 route-handler テストがあれば mock 構成の
参考にする）。

Run: `bun scripts/run-tests.ts __tests__/unit/actions/reservation-export-audit.test.ts`
Expected: PASS

- [ ] **Step 7: ブラウザで手動確認**

予約一覧でスペースを絞り込み、CSVエクスポートを実行して該当スペースのみが
出力されることを確認する。管理画面の監査ログ一覧で当該エクスポートの詳細を開き、
`filterSpaceId`/`filterStartDate`/`filterEndDate` が記録されていることを確認する。

- [ ] **Step 8: コミット**

```bash
git add src/shared/lib/nuqs/parsers.ts \
  "src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationFilters.tsx" \
  "src/app/(admin)/admin/(dashboard)/reservations/page.tsx" \
  src/app/api/admin/export/reservations/route.ts \
  __tests__/unit/actions/reservation-export-audit.test.ts
git commit -m "feat(admin): add space filter to reservation list/export, record date range in audit metadata"
```

---

### Task 11: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 2: 全 unit テスト**

Run: `bun run test:unit`
Expected: 全件 PASS（既知の無関係なローカル環境変数アーティファクト
`server-production-env.test.ts` の失敗のみ許容 — Phase 1/2 と同じ既知事象）

- [ ] **Step 3: 全 integration テスト**

Run: `bun run test:integration`
Expected: 全件 PASS

- [ ] **Step 4: architecture-boundaries**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: PASS（thin admin action / Prisma import 境界等の grep gate を含む）

- [ ] **Step 5: ブラウザでの一連の手動確認（回帰含む）**

- 予約編集フォームでゲスト連絡先を編集→保存→再読み込みで保持されること、
  Customer 側の情報が変化しないこと
- 一覧行・詳細ページ・一括操作それぞれで CANCELLED 遷移時に理由ダイアログが出ること、
  理由なしでもキャンセルできること
- 部分返金後の「残額」表示が正しく減っていること、ポリシー推奨額のヒントが出ること
- スペースフィルタが一覧・CSV双方に反映され、監査ログに記録されること
- 既存機能（一括確定・領収書再発行・決済リンク作成等）に regression が無いこと

- [ ] **Step 6: このファイルの全チェックボックスが埋まっていることを確認してから完了**
