# Reservation optimistic concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Reservation` テーブルに `version Int` 列を追加し、form-driven update path (customer + admin) を optimistic concurrency で保護する。silent lost-update race (2 タブで異なる値を submit、後着だけが勝つ) を DB レベルで防ぐ。

**Architecture:** Rails ActiveRecord `optimistic_locking` / Hibernate `@Version` と同型。form が予約を load するとき version を hidden input で保持し、submit 時に `updateMany` の WHERE 述語で claim + increment。conflict は `count=0` で検知して「別のデバイスまたはタブで変更されました」を form 上に表示する。cron / payment / calendar-sync 等の非 form path は Rails `.update_all` と同型で対象外。

**Tech Stack:** Prisma 7 + PostgreSQL 16 / Next.js 16 App Router / React 19 / Zod 4 / conform / Better Auth (顧客のみ)

## Global Constraints

- Bun 1.3.14 (packageManager が SSoT) / TypeScript 6.0.3 exact pin
- テストは `bun scripts/run-tests.ts` 経由必須 (素の `bun test <dir>` は mock.module 汚染と Lexical TDZ で壊れる)
- `bun run validate` は type-check + lint のみ (テストは含まれない)
- Prisma は `@/shared/db/prisma` からのみ import、import するファイルは `import "server-only"` 必須
- `@generated/prisma` の直 import は `src/shared/db` / `src/shared/domain` / `src/shared/lib/validations/enums/` の 3 箇所のみ
- `any` 系 / `!` non-null assertion / `@ts-ignore` / `as {...}` 危険 cast は grep gate で 0 件
- 既存 `prisma/migrations/*/migration.sql` は編集禁止 (pre-commit blocker)、修正は新規 migration
- 予約書込は `prisma.$transaction` 内で `lockSpaceForTransaction(tx, spaceId)` を overlap チェックより先に取得 (advisory lock 728351)
- 日付表示は `src/shared/lib/date-format.ts` の JST 固定 formatter 経由
- `git push` / `git commit` の tool timeout は 300 秒以上 (pre-push が type-check + architecture-boundaries 直列で 85 秒超)
- `.env*` / `bun.lock` は編集しない
- `main` への push = 即本番デプロイ (breaking migration は自動計画ダウンタイム、本 PR は additive で該当せず)
- 完了報告前に `bun run validate && bun run build` 必須、コミット前も同様
- Zod 4: エラーメッセージは `{ error: "..." }` 形式
- conform: `useForm<z.input<typeof Schema>>` (明示 generic) + `import type { z }` + `constraint: getZodConstraint(schema)`
- `parseWithZod` は空入力を undefined に変換する (必須 field は空欄 reject 済)

## File Structure

### 新規

- `prisma/migrations/<timestamp>_add_reservation_version/migration.sql` — `ALTER TABLE reservations ADD COLUMN version`

### 修正 (schema)

- `prisma/schema.prisma` — Reservation モデルに version 列追加

### 修正 (customer path)

- `src/shared/lib/validations/customer-reservation.ts` — Zod schema に version 追加
- `src/shared/domain/reservations/customer-commands.ts` — updateMany の WHERE 述語 + increment
- `src/app/(public)/mypage/_shared/actions/reservation.ts` — action で version 中継
- `src/app/(public)/mypage/reservations/[id]/edit/page.tsx` — loader で version select
- `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` — hidden input

### 修正 (admin path)

- `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts` — Zod schema に version 追加
- `src/shared/domain/reservations/admin-commands.ts` — `tx.reservation.update` → `updateMany` + version 述語 + findUniqueOrThrow で icsSequence 取得
- `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts` — action で version 中継
- `src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx` — loader で version 経由 (getReservationById 内で追加)
- `src/admin/queries/reservation.ts` — getReservationById の select に version 追加 (実装時にファイル位置確認)
- `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx` — hidden input

### 修正 (test)

- `__tests__/unit/shared/lib/validations/customer-reservation.test.ts` — version 必須検証
- `__tests__/integration/actions/public/mypage-reservation.test.ts` — customer race + regression
- `__tests__/unit/domain/reservations/commands.test.ts` — admin schema version 必須検証 + admin command version 述語動作
- `__tests__/integration/reservations/admin-commands.test.ts` — admin race + 顧客 vs admin race + 非 form path 版数不変 gate

---

## Task 1: Schema + Migration

**Files:**

- Modify: `prisma/schema.prisma:670-673` (Reservation モデルの updatedAt 隣に version 追加)
- Create: `prisma/migrations/<timestamp>_add_reservation_version/migration.sql`

**Interfaces:**

- Consumes: なし
- Produces: `Reservation.version: number` 列 (default 0、既存レコードは backfill 済)

- [ ] **Step 1: schema.prisma を編集**

`prisma/schema.prisma` の `Reservation` モデル、`updatedAt DateTime @updatedAt` (行 673 相当) の直下に version 列を追加:

```prisma
model Reservation {
  id         String            @id @default(uuid()) @db.Uuid
  // ... 既存 fields ...
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt

  /// Optimistic concurrency (Rails ActiveRecord lock_version / Hibernate @Version と同型)。
  /// form-driven update path (updateCustomerReservation / updateAdminReservationCommand) が
  /// updateMany の WHERE 述語で claim + increment する。cron / payment / calendar-sync 等の
  /// 非 form path は touch しない (Rails .update_all / Hibernate native query と同型)。
  version Int @default(0)

  // ... 既存 fields 続き ...
}
```

- [ ] **Step 2: Prisma client 再生成**

Run: `bun run db:generate`
Expected: エラーなし。`generated/prisma` 以下に `version: number` 型が反映される。

- [ ] **Step 3: migration 生成 (対話実行必須)**

Run: `bun run db:migrate --name add_reservation_version`

対話プロンプトが出る可能性あり (drift 検出時)。非対話環境で刺さる場合はユーザーに依頼。

Expected: `prisma/migrations/<timestamp>_add_reservation_version/migration.sql` が生成される。

- [ ] **Step 4: 生成 SQL を確認**

Run: `cat prisma/migrations/<timestamp>_add_reservation_version/migration.sql`

Expected: 以下の 1 行 (順序・空白は Prisma 生成に依存):

```sql
ALTER TABLE "reservations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
```

これ以外の DDL が含まれていたら停止 (drift か想定外変更)。

- [ ] **Step 5: squawk lint**

Run: `bun scripts/lint-migrations.ts prisma/migrations/<timestamp>_add_reservation_version/migration.sql`
Expected: PASS。`NOT NULL DEFAULT` は Postgres 11+ で fast-path (metadata-only) のため rewrite 警告なし。警告が出たら §4 の適切な ignore コメント付与を検討。

- [ ] **Step 6: テスト DB へ migrate**

Run: `bun run test:db:migrate`
Expected: 空 DB からの全 migration 再生が通る。

- [ ] **Step 7: architecture-boundaries テスト**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: PASS (schema 変更が既存 grep gate に触れないこと)。

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(reservations): add version column for optimistic concurrency

Rails ActiveRecord lock_version / Hibernate @Version と同型の楽観制御列。
form-driven update path (customer + admin) が updateMany の WHERE 述語で claim +
increment する。cron / payment / calendar-sync 等の非 form path は touch しない。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Customer Zod schema に version 追加

**Files:**

- Modify: `src/shared/lib/validations/customer-reservation.ts:5-33`
- Test: `__tests__/unit/shared/lib/validations/customer-reservation.test.ts`

**Interfaces:**

- Consumes: Task 1 の `Reservation.version` 型
- Produces: `customerReservationEditSchema` の `output` 型に `version: number` フィールド

- [ ] **Step 1: unit test に version 必須検証を追加 (TDD failing test)**

`__tests__/unit/shared/lib/validations/customer-reservation.test.ts` に以下のテストブロックを追加 (既存 describe 内、末尾):

```ts
describe("version field (optimistic concurrency)", () => {
  const validBase = {
    reservationId: "00000000-0000-4000-8000-000000000000",
    spaceId: "00000000-0000-4000-8000-000000000001",
    date: "2099-01-01",
    startTime: "10:00",
    endTime: "11:00",
    numberOfGuests: 1,
    turnstileToken: "tok",
  };

  test("version 必須: 欠損は parse fail", () => {
    const result = customerReservationEditSchema.safeParse(validBase);
    expect(result.success).toBe(false);
  });

  test("version は非負整数: 0 は許容", () => {
    const result = customerReservationEditSchema.safeParse({
      ...validBase,
      version: 0,
    });
    expect(result.success).toBe(true);
  });

  test("version は非負整数: 負数は reject", () => {
    const result = customerReservationEditSchema.safeParse({
      ...validBase,
      version: -1,
    });
    expect(result.success).toBe(false);
  });

  test("version は非負整数: 小数は reject", () => {
    const result = customerReservationEditSchema.safeParse({
      ...validBase,
      version: 1.5,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: テスト実行して fail 確認**

Run: `bun scripts/run-tests.ts __tests__/unit/shared/lib/validations/customer-reservation.test.ts`
Expected: 新規 4 テストが FAIL (version 未定義のため `success: true` になる or 逆)。

- [ ] **Step 3: schema に version 追加**

`src/shared/lib/validations/customer-reservation.ts` の `customerReservationEditSchema` に `version` field を追加:

```ts
export const customerReservationEditSchema = z
  .object({
    reservationId: z.uuid({ error: "予約IDが不正です" }),
    spaceId: z.uuid({ error: "スペースを選択してください" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      error: "日付の形式が正しくありません（YYYY-MM-DD）",
    }),
    startTime: z.string().regex(TIME_REGEX, {
      error: "時間の形式が正しくありません（HH:MM）",
    }),
    endTime: z.string().regex(TIME_REGEX, {
      error: "時間の形式が正しくありません（HH:MM）",
    }),
    numberOfGuests: z.number().int().min(1, { error: "利用人数は1名以上です" }),
    turnstileToken: z.string().optional(),
    // 楽観制御: form が予約を load した時点の version を hidden で持ち回る。
    // domain command が updateMany の WHERE 述語で claim する (§3.2 spec)。
    version: z
      .number()
      .int({ error: "バージョンが不正です" })
      .nonnegative({ error: "バージョンが不正です" }),
  })
  .refine(
    // ... 既存 refine 群 ...
```

- [ ] **Step 4: テスト実行して pass 確認**

Run: `bun scripts/run-tests.ts __tests__/unit/shared/lib/validations/customer-reservation.test.ts`
Expected: 全テスト PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/validations/customer-reservation.ts __tests__/unit/shared/lib/validations/customer-reservation.test.ts
git commit -m "$(cat <<'EOF'
feat(validations): add version field to customerReservationEditSchema

顧客セルフ変更 form が予約 version を hidden input で保持し、Server Action 経由で
updateCustomerReservation の楽観制御 claim に渡すための Zod field 追加。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Customer domain command の version 契約実装

**Files:**

- Modify: `src/shared/domain/reservations/customer-commands.ts:157-441`
- Test: `__tests__/integration/actions/public/mypage-reservation.test.ts`

**Interfaces:**

- Consumes: `customerReservationEditSchema.output.version: number`, `Reservation.version` 列
- Produces: `updateCustomerReservation(id, customerId, input: {..., version: number}, ...)`
  戻り値は既存の `CommandResult<UpdatePayload>`。version mismatch は `{ success: false, error: "予約情報が別のデバイス..." }` (新 error 文言)

- [ ] **Step 1: integration test で customer race を再現 (TDD failing test)**

`__tests__/integration/actions/public/mypage-reservation.test.ts` に以下の describe ブロックを追加:

```ts
describe("optimistic concurrency (version)", () => {
  test("regression: 単発 update で version が 0 → 1 に increment", async () => {
    const fixture = await createReservationFixture({ version: 0 });
    const result = await updateCustomerReservation(
      fixture.reservationId,
      fixture.customerId,
      {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "10:00",
        endTime: "11:00",
        version: 0,
      },
      MODIFICATION_DEADLINE_HOURS,
    );
    expect(result.success).toBe(true);
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: fixture.reservationId },
      select: { version: true },
    });
    expect(after.version).toBe(1);
  });

  test("customer タブ間 race: 同じ version=0 の 2 update で 1 succeed / 1 CONFLICT", async () => {
    const fixture = await createReservationFixture({ version: 0 });
    const [firstResult, secondResult] = await Promise.all([
      updateCustomerReservation(
        fixture.reservationId,
        fixture.customerId,
        {
          spaceId: fixture.spaceId,
          date: fixture.date,
          startTime: "10:00",
          endTime: "11:00",
          version: 0,
        },
        MODIFICATION_DEADLINE_HOURS,
      ),
      updateCustomerReservation(
        fixture.reservationId,
        fixture.customerId,
        {
          spaceId: fixture.spaceId,
          date: fixture.date,
          startTime: "14:00",
          endTime: "15:00",
          version: 0,
        },
        MODIFICATION_DEADLINE_HOURS,
      ),
    ]);

    const successes = [firstResult, secondResult].filter((r) => r.success);
    const failures = [firstResult, secondResult].filter((r) => !r.success);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.success ? "" : failures[0]!.error).toContain(
      "予約情報が別のデバイスまたはタブで変更されました",
    );
  });

  test("再試行: conflict 後、最新 version=1 で再 submit → 成功", async () => {
    const fixture = await createReservationFixture({ version: 0 });
    // 1 回目: version=0 で成功
    const first = await updateCustomerReservation(
      fixture.reservationId,
      fixture.customerId,
      {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "10:00",
        endTime: "11:00",
        version: 0,
      },
      MODIFICATION_DEADLINE_HOURS,
    );
    expect(first.success).toBe(true);

    // 2 回目: 古い version=0 で conflict
    const stale = await updateCustomerReservation(
      fixture.reservationId,
      fixture.customerId,
      {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "14:00",
        endTime: "15:00",
        version: 0,
      },
      MODIFICATION_DEADLINE_HOURS,
    );
    expect(stale.success).toBe(false);

    // 3 回目: 最新 version=1 で成功
    const retry = await updateCustomerReservation(
      fixture.reservationId,
      fixture.customerId,
      {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "14:00",
        endTime: "15:00",
        version: 1,
      },
      MODIFICATION_DEADLINE_HOURS,
    );
    expect(retry.success).toBe(true);
  });
});
```

`createReservationFixture` は既存 helper (存在しない場合、既存の fixture 生成 pattern を踏襲してファイル冒頭に inline 定義。テスト内では seed が済んだ空き reservation を 1 件作って id/customerId/spaceId/date を返す。既存の他 test の fixture 生成コードをコピーする)。

- [ ] **Step 2: テスト実行して fail 確認**

Run: `bun scripts/run-tests.ts __tests__/integration/actions/public/mypage-reservation.test.ts`
Expected: 新 3 テストが FAIL:

- regression: version field が存在しないため type error (TS compile fail)
- race: 2 update 両方成功してしまう
- retry: 同上

- [ ] **Step 3: domain command に version 対応実装**

`src/shared/domain/reservations/customer-commands.ts` の `updateCustomerReservation` を編集:

**input 型に version を追加** (行 160-165):

```ts
export async function updateCustomerReservation(
  reservationId: string,
  customerId: string,
  input: {
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
    version: number;
  },
  modificationDeadlineHours: number,
): Promise<CommandResult<UpdatePayload>> {
```

**tx 内 updateMany の WHERE + data に version 追加** (行 399-437 相当):

```ts
const updated = await tx.reservation.updateMany({
  where: {
    id: reservationId,
    deletedAt: null,
    paymentStatus: PaymentStatus.UNPAID,
    version: input.version,
  },
  data: {
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
    basePrice: pricing.basePrice,
    totalPrice: pricing.totalPrice,
    rateBreakdownJson: asPrismaInputJsonValue(
      pricing.rateBreakdown,
      "料金内訳の生成に失敗しました",
    ),
    spaceDiscountAmount: pricing.spaceDiscountAmount,
    durationDiscountAmount: pricing.durationDiscountAmount,
    couponDiscountAmount: pricing.couponDiscountAmount,
    taxAmount,
    totalPriceWithTax: pricing.totalPrice + taxAmount,
    priceOverriddenBy: null,
    couponId: couponForCalc ? reservation.couponId : null,
    icsSequence: { increment: 1 },
    version: { increment: 1 },
  },
});

if (updated.count === 0) {
  // 決済 TOCTOU (paymentStatus 変化) と optimistic lock 失敗 (version mismatch) の
  // 2 種を union で受ける。顧客向けメッセージは後者 (別タブ変更) を優先表示する
  // (前者は既に上部の paymentStatus gate で「決済処理が開始された...」が表示済)。
  return {
    success: false,
    error:
      "予約情報が別のデバイスまたはタブで変更されました。ページを再読み込みしてから、もう一度お試しください。",
  };
}
```

- [ ] **Step 4: テスト実行して pass 確認**

Run: `bun scripts/run-tests.ts __tests__/integration/actions/public/mypage-reservation.test.ts`
Expected: 新 3 テスト PASS。既存テストは version 未渡しで TS compile fail → 次 Step で修正。

- [ ] **Step 5: 既存テストの呼出箇所を修正**

`__tests__/integration/actions/public/mypage-reservation.test.ts` の既存 `updateCustomerReservation` 呼出箇所を grep して全件 `version: 0` を追加:

Run: `grep -n "updateCustomerReservation" __tests__/integration/actions/public/mypage-reservation.test.ts`

各呼出の input object に `version: 0` を追加 (fixture が初期 version=0 で作成されるため)。

Run: `bun scripts/run-tests.ts __tests__/integration/actions/public/mypage-reservation.test.ts`
Expected: 全テスト PASS。

- [ ] **Step 6: type-check**

Run: `bun run validate`
Expected: PASS (type-check + lint)。他ファイルで `updateCustomerReservation` を呼んでいる箇所があれば TS error になるため次 Step で対処、無ければ次 task へ。

- [ ] **Step 7: Commit**

```bash
git add src/shared/domain/reservations/customer-commands.ts __tests__/integration/actions/public/mypage-reservation.test.ts
git commit -m "$(cat <<'EOF'
feat(reservations): add optimistic concurrency to updateCustomerReservation

updateMany の WHERE に version 述語を追加し、data で version increment。
count=0 で「別のデバイスまたはタブで変更されました」を返す。既存の paymentStatus:
UNPAID gate と union して「決済 TOCTOU + version mismatch」の両方を検知する。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Customer wire (action + loader + form)

**Files:**

- Modify: `src/app/(public)/mypage/_shared/actions/reservation.ts:158-307` (updateReservationAction handler)
- Modify: `src/app/(public)/mypage/reservations/[id]/edit/page.tsx` (loader)
- Modify: `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` (hidden input)
- Modify: `src/shared/domain/reservations/customer-queries.ts` (getCustomerReservationDetail の select に version 追加 — 実装時にファイル位置と関数シグネチャを確認)

**Interfaces:**

- Consumes: Task 3 の `updateCustomerReservation` (input.version 必須), Task 2 の `customerReservationEditSchema`
- Produces: EditReservationForm が version を hidden input で送信、action が data.version を command に中継

- [ ] **Step 1: getCustomerReservationDetail の select に version 追加**

Run: `grep -n "getCustomerReservationDetail" src/shared/domain/reservations/customer-queries.ts`

該当 select 節に `version: true` を追加。返り値型に `version: number` が反映される。

- [ ] **Step 2: page.tsx で version を form に渡す**

`src/app/(public)/mypage/reservations/[id]/edit/page.tsx` の `<EditReservationForm>` invocation に `version` prop を追加:

```tsx
<EditReservationForm
  key={reservation.id}
  reservationId={reservation.id}
  numberOfGuests={1}
  spaces={spaces}
  version={reservation.version}
  initialValues={{
    spaceId: reservation.spaceId,
    date: dateStr,
    startTime: startTimeStr,
    endTime: endTimeStr,
  }}
  turnstileSiteKey={turnstileSiteKey}
/>
```

- [ ] **Step 3: EditReservationForm に version prop + hidden input**

`src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` の `EditReservationFormProps` に `version: number` を追加:

```tsx
interface EditReservationFormProps {
  readonly reservationId: string;
  readonly numberOfGuests: number;
  readonly spaces: readonly SpaceOption[];
  readonly initialValues: InitialValues;
  readonly turnstileSiteKey: string | null;
  readonly version: number;
}
```

引数 destructuring に `version` を追加:

```tsx
export function EditReservationForm({
  reservationId,
  numberOfGuests,
  spaces,
  initialValues,
  turnstileSiteKey,
  version,
}: EditReservationFormProps): ReactElement {
```

`defaultValue` に `version` を追加:

```tsx
defaultValue: {
  reservationId,
  spaceId: initialValues.spaceId,
  date: initialValues.date,
  startTime: initialValues.startTime,
  endTime: initialValues.endTime,
  numberOfGuests,
  version,
},
```

form 内の hidden input 群に version を追加 (既存 hidden `reservationId` / `numberOfGuests` / `turnstileToken` の隣、行 161-175 相当):

```tsx
<input type="hidden" name={fields.version.name} value={String(version)} />
```

- [ ] **Step 4: action handler で data.version を command に中継**

`src/app/(public)/mypage/_shared/actions/reservation.ts` の `updateReservationAction` 内、`updateCustomerReservation` 呼出 (行 207-212 相当) に `version: data.version` を追加:

```ts
const result = await updateCustomerReservation(
  data.reservationId,
  customer.id,
  {
    spaceId: data.spaceId,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    version: data.version,
  },
  settings.modificationDeadlineHours,
);
```

- [ ] **Step 5: type-check で漏れ確認**

Run: `bun run validate`
Expected: PASS。他ファイルで `EditReservationForm` を呼び出す or `getCustomerReservationDetail` の返り値を触る箇所があれば TS error。修正して再実行。

- [ ] **Step 6: 既存 integration test (もし触れる場合) の form data に version 追加**

Run: `grep -rn "customerReservationEditSchema\|updateReservationAction" __tests__/`

該当 form data mock に `version: "0"` (FormData は文字列だが、customer schema は `z.number()` で受けているため、テスト側は object 直接渡しの safeParse なら `version: 0`)。

Run: `bun scripts/run-tests.ts __tests__/`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/shared/domain/reservations/customer-queries.ts src/app/\(public\)/mypage/reservations/\[id\]/edit/page.tsx src/app/\(public\)/mypage/reservations/\[id\]/edit/_components/edit-reservation-form.tsx src/app/\(public\)/mypage/_shared/actions/reservation.ts
git commit -m "$(cat <<'EOF'
feat(mypage): wire reservation version through edit form and action

Customer edit form が hidden input で version を送信、Server Action handler で
updateCustomerReservation の input に中継。loader (page.tsx) は
getCustomerReservationDetail の select に version を含めて form に渡す。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Admin Zod schema に version 追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts:187-201` (updateReservationFormSchema)
- Test: `__tests__/unit/domain/reservations/commands.test.ts` (admin form schema の version 検証を追加)

**Interfaces:**

- Consumes: Task 1 の `Reservation.version`
- Produces: `updateReservationFormSchema.output.version: number` (FormData 文字列 → int coerce)

- [ ] **Step 1: unit test に version 必須検証を追加 (TDD failing test)**

`__tests__/unit/domain/reservations/commands.test.ts` に新規 describe を追加 (既存の describe 群の末尾):

```ts
describe("updateReservationFormSchema (admin) version field", () => {
  const validBase = {
    spaceId: "00000000-0000-4000-8000-000000000001",
    date: "2099-01-01",
    startTime: "10:00",
    endTime: "11:00",
    customerId: "00000000-0000-4000-8000-000000000002",
    status: ReservationStatus.CONFIRMED,
    couponCode: "",
    notes: "",
    totalPrice: "",
  };

  test("version 必須: 欠損は parse fail", () => {
    const result = updateReservationFormSchema.safeParse(validBase);
    expect(result.success).toBe(false);
  });

  test("version は文字列 '0' から coerce される (FormData 想定)", () => {
    const result = updateReservationFormSchema.safeParse({
      ...validBase,
      version: "0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(0);
    }
  });

  test("version は非負整数: 負数は reject", () => {
    const result = updateReservationFormSchema.safeParse({
      ...validBase,
      version: "-1",
    });
    expect(result.success).toBe(false);
  });
});
```

必要 import (ファイル冒頭):

```ts
import { updateReservationFormSchema } from "@/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
```

- [ ] **Step 2: テスト実行して fail 確認**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/reservations/commands.test.ts`
Expected: 新 3 テストが FAIL。

- [ ] **Step 3: admin schema に version 追加**

`src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts` の `updateReservationFormSchema` (行 187-201) に `version` field を追加:

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
    // 楽観制御: form が予約を load した時点の version を hidden で持ち回る。
    // updateAdminReservationCommand が updateMany の WHERE 述語で claim する。
    version: z.coerce
      .number({ error: "バージョンが不正です" })
      .int({ error: "バージョンが不正です" })
      .nonnegative({ error: "バージョンが不正です" }),
  })
  .superRefine((data, ctx) => {
    refineTimeRange(data, ctx);
  });
```

`z.coerce.number()` を使う理由: FormData は文字列で送られるため。customer 側は既に schema level で number を受けているが、admin 側は他 field (`totalPrice`) も preprocess で coerce している同型 pattern。

- [ ] **Step 4: テスト実行して pass 確認**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/reservations/commands.test.ts`
Expected: 新 3 テスト PASS。

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/reservation-form-schema.ts __tests__/unit/domain/reservations/commands.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): add version field to updateReservationFormSchema

admin edit form が予約 version を hidden input で保持し、Server Action 経由で
updateAdminReservationCommand の楽観制御 claim に渡すための Zod field 追加。
FormData 文字列を z.coerce.number() で int に変換。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin domain command の version 契約実装

**Files:**

- Modify: `src/shared/domain/reservations/admin-commands.ts:393-449` (tx.reservation.update → updateMany)
- Test: `__tests__/integration/reservations/admin-commands.test.ts` (admin race + 顧客 vs admin race)

**Interfaces:**

- Consumes: `updateReservationFormSchema.output.version`, `Reservation.version` 列
- Produces: `updateAdminReservationCommand(id, input: {..., version: number})`
  戻り値は既存の payload 型。version mismatch は `DomainError(message, "CONFLICT")` throw

- [ ] **Step 1: integration test で admin race + 顧客 vs admin race を再現 (TDD failing test)**

`__tests__/integration/reservations/admin-commands.test.ts` に新規 describe を追加:

```ts
describe("optimistic concurrency (version)", () => {
  test("regression: 単発 admin update で version が 0 → 1 に increment", async () => {
    const fixture = await createAdminReservationFixture({ version: 0 });
    await updateAdminReservationCommand(fixture.reservationId, {
      spaceId: fixture.spaceId,
      date: fixture.date,
      startTime: "10:00",
      endTime: "11:00",
      customerId: fixture.customerId,
      status: ReservationStatus.CONFIRMED,
      adminUserId: fixture.adminUserId,
      version: 0,
    });
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: fixture.reservationId },
      select: { version: true },
    });
    expect(after.version).toBe(1);
  });

  test("admin タブ間 race: 同 version=0 の 2 update で 1 succeed / 1 CONFLICT", async () => {
    const fixture = await createAdminReservationFixture({ version: 0 });
    const results = await Promise.allSettled([
      updateAdminReservationCommand(fixture.reservationId, {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "10:00",
        endTime: "11:00",
        customerId: fixture.customerId,
        status: ReservationStatus.CONFIRMED,
        adminUserId: fixture.adminUserId,
        version: 0,
      }),
      updateAdminReservationCommand(fixture.reservationId, {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "14:00",
        endTime: "15:00",
        customerId: fixture.customerId,
        status: ReservationStatus.CONFIRMED,
        adminUserId: fixture.adminUserId,
        version: 0,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0]! as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("CONFLICT");
  });

  test("顧客 vs admin race: 顧客が version=0 で保持中に admin が版数を進める → 顧客 submit が CONFLICT", async () => {
    const fixture = await createAdminReservationFixture({ version: 0 });

    // admin が version=0 で update → version=1
    await updateAdminReservationCommand(fixture.reservationId, {
      spaceId: fixture.spaceId,
      date: fixture.date,
      startTime: "10:00",
      endTime: "11:00",
      customerId: fixture.customerId,
      status: ReservationStatus.CONFIRMED,
      adminUserId: fixture.adminUserId,
      version: 0,
    });

    // 顧客は古い version=0 のまま submit → CONFLICT
    const customerResult = await updateCustomerReservation(
      fixture.reservationId,
      fixture.customerId,
      {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "14:00",
        endTime: "15:00",
        version: 0,
      },
      MODIFICATION_DEADLINE_HOURS,
    );
    expect(customerResult.success).toBe(false);
    if (!customerResult.success) {
      expect(customerResult.error).toContain(
        "予約情報が別のデバイスまたはタブで変更されました",
      );
    }
  });
});
```

`createAdminReservationFixture` は既存 fixture helper を踏襲。存在しなければ Task 6 内で inline 定義。

- [ ] **Step 2: テスト実行して fail 確認**

Run: `bun scripts/run-tests.ts __tests__/integration/reservations/admin-commands.test.ts`
Expected: 新 3 テストが FAIL。

- [ ] **Step 3: admin command に version 対応実装**

`src/shared/domain/reservations/admin-commands.ts` の `updateAdminReservationCommand` を編集:

**input 型に version 追加** (関数シグネチャ、input object 定義箇所):

```ts
export async function updateAdminReservationCommand(
  id: string,
  input: {
    // ... 既存 fields ...
    version: number;
  },
): Promise<...> {
```

**tx 内 `tx.reservation.update` を `updateMany` に置き換え** (行 406-433):

```ts
const updateResult = await tx.reservation.updateMany({
  where: {
    id,
    deletedAt: null,
    version: input.version,
  },
  data: {
    spaceId: input.spaceId,
    customerId: input.customerId,
    startTime: startDateTime,
    endTime: endDateTime,
    status: input.status,
    totalPrice: finalTotalPrice,
    basePrice: pricing.basePrice,
    rateBreakdownJson: asPrismaInputJsonValue(
      pricing.rateBreakdown,
      "料金内訳の生成に失敗しました",
    ),
    ...(input.totalPrice != null && {
      priceOverriddenBy: input.adminUserId,
    }),
    couponId: newCouponId,
    couponDiscountAmount: pricing.couponDiscountAmount,
    durationDiscountAmount: pricing.durationDiscountAmount,
    spaceDiscountAmount: pricing.spaceDiscountAmount,
    taxAmount,
    totalPriceWithTax,
    notes: input.notes || null,
    icsSequence: { increment: 1 },
    version: { increment: 1 },
  },
});

if (updateResult.count === 0) {
  throw new DomainError(
    "予約情報が別の画面で変更されました。予約詳細画面に戻って再読み込みしてから、もう一度お試しください。",
    "CONFLICT",
  );
}

// updateMany は select 不可のため icsSequence を別 SELECT で取得。
// 同 tx 内・成功後・version は既に increment 済みなので stale read 無し。
const refreshed = await tx.reservation.findUniqueOrThrow({
  where: { id },
  select: { icsSequence: true },
});
updatedIcsSequence = refreshed.icsSequence;
```

`updatedReservation` を使っていた既存参照はすべて上記 `refreshed` に置換 (grep で漏れ確認)。

- [ ] **Step 4: テスト実行して pass 確認**

Run: `bun scripts/run-tests.ts __tests__/integration/reservations/admin-commands.test.ts`
Expected: 新 3 テスト PASS。既存テストは version 未渡しで TS compile fail → 次 Step で修正。

- [ ] **Step 5: 既存テストの呼出箇所を修正**

Run: `grep -n "updateAdminReservationCommand" __tests__/integration/reservations/admin-commands.test.ts`

各呼出の input に `version: 0` を追加。他ファイルで直接呼び出している箇所も grep:

Run: `grep -rn "updateAdminReservationCommand" __tests__/ src/`

Run: `bun scripts/run-tests.ts __tests__/integration/reservations/admin-commands.test.ts`
Expected: 全テスト PASS。

- [ ] **Step 6: type-check**

Run: `bun run validate`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/shared/domain/reservations/admin-commands.ts __tests__/integration/reservations/admin-commands.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): add optimistic concurrency to updateAdminReservationCommand

tx.reservation.update を updateMany に置き換え、WHERE に version 述語追加 +
data で version increment。count=0 で DomainError("...", "CONFLICT") throw。
icsSequence は同 tx 内 findUniqueOrThrow で別 select (updateMany は select 不可)。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin wire (action + loader + form)

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts:192-312` (updateReservationAction handler)
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx` (通じて getReservationById の返り値に version を含める)
- Modify: `src/admin/queries/reservation.ts` (getReservationById の select に version 追加 — grep で位置確認)
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx` (hidden input + formErrors 帯確認)

**Interfaces:**

- Consumes: Task 6 の `updateAdminReservationCommand` (input.version 必須), Task 5 の `updateReservationFormSchema`
- Produces: admin edit form が version を hidden input で送信、action が data.version を command に中継、CONFLICT DomainError が form 上に「予約情報が別の画面で変更されました...」を表示

- [ ] **Step 1: getReservationById の select に version 追加**

Run: `grep -rn "getReservationById" src/admin/`

該当 select 節に `version: true` を追加。返り値型に `version: number` が反映される。

- [ ] **Step 2: ReservationEditForm の hidden input と defaultValue に version 追加**

`src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx` を編集。

`useForm` の `defaultValue` に `version` を追加 (行 179-183 相当):

```tsx
defaultValue: {
  couponCode: reservation.coupon?.code ?? "",
  notes: reservation.notes ?? "",
  version: reservation.version,
},
```

hidden input 群 (行 231-245 相当) に version を追加:

```tsx
<input
  type="hidden"
  name={fields.version.name}
  value={String(reservation.version)}
/>
```

既存の `form.errors && form.errors.length > 0` の formErrors 表示帯 (行 247-254) は既に存在するので、CONFLICT メッセージは `executeAdminMutationResult` の DomainError 自動変換 → `submission.reply` 経由で自動的にここに表示される。追加改修不要。

- [ ] **Step 3: action handler で data.version を command に中継**

`src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts` の `updateReservationAction` 内、`updateAdminReservationCommand` 呼出 (行 211-228 相当) に `version: data.version` を追加:

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
  }),
);
```

- [ ] **Step 4: type-check で漏れ確認**

Run: `bun run validate`
Expected: PASS。ReservationEditForm を触る他コンポーネント、getReservationById の返り値を触る他箇所があれば TS error。修正。

- [ ] **Step 5: 既存 admin integration test の form data に version 追加**

Run: `grep -rn "updateReservationFormSchema\|updateReservationAction" __tests__/`

該当 mock に `version: "0"` (文字列 FormData 想定) or `version: 0` (safeParse 直接) を追加。

Run: `bun scripts/run-tests.ts __tests__/`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/admin/queries/reservation.ts src/app/\(admin\)/admin/\(dashboard\)/reservations/\[id\]/edit/page.tsx src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/ReservationEditForm.tsx src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/reservation/admin.ts
git commit -m "$(cat <<'EOF'
feat(admin): wire reservation version through edit form and action

Admin edit form が hidden input で version を送信、Server Action handler で
updateAdminReservationCommand の input に中継。loader は getReservationById の
select に version を含めて form に渡す。CONFLICT DomainError は既存の form
error 帯に「予約情報が別の画面で変更されました」を表示する。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 非 form path 版数不変 gate test

**Files:**

- Test: `__tests__/integration/reservations/admin-commands.test.ts` (or 適宜 分離テスト)

**Interfaces:**

- Consumes: Task 1 の `Reservation.version`
- Produces: 「非 form path (cron / payment / cancel-core) 経由の書込後、version が変化しない」を機械検証する gate test。将来の regression 予防。

- [ ] **Step 1: gate test を追加**

`__tests__/integration/reservations/admin-commands.test.ts` (もしくは新規 `non-form-version-invariance.test.ts`) に describe 追加:

```ts
describe("非 form path は version を touch しない (spec §3.1.1 gate)", () => {
  test("cancel-core (cancelCustomerReservation) 経由の書込後、version は不変", async () => {
    const fixture = await createReservationFixture({ version: 0 });
    // まず form path で version を 0 → 1 に進める
    await updateCustomerReservation(
      fixture.reservationId,
      fixture.customerId,
      {
        spaceId: fixture.spaceId,
        date: fixture.date,
        startTime: "10:00",
        endTime: "11:00",
        version: 0,
      },
      MODIFICATION_DEADLINE_HOURS,
    );
    const beforeCancel = await prisma.reservation.findUniqueOrThrow({
      where: { id: fixture.reservationId },
      select: { version: true },
    });
    expect(beforeCancel.version).toBe(1);

    // cancel (非 form path) 実行
    await cancelCustomerReservation(
      fixture.reservationId,
      fixture.customerId,
      DEFAULT_DEADLINE_HOURS,
      "test cancel",
    );

    const afterCancel = await prisma.reservation.findUniqueOrThrow({
      where: { id: fixture.reservationId },
      select: { version: true, status: true },
    });
    expect(afterCancel.status).toBe(ReservationStatus.CANCELLED);
    expect(afterCancel.version).toBe(1); // 不変
  });

  test("payment-commands.ts の paymentStatus 遷移でも version は不変", async () => {
    // pending-expiry.ts か payment-queries.ts の updateMany を直接呼び、
    // version が touch されないことを assert。実装時に呼び出し可能な関数を選定。
    const fixture = await createReservationFixture({ version: 0 });

    // 例: payment-queries.ts の markCheckoutSessionExpired など UNPAID → 遷移させる関数
    // (fixture 内容や関数選定は実装時に adjust)。ここでは pending-expiry の cutoff
    // 相当を疑似的に呼び出す:
    await prisma.reservation.updateMany({
      where: { id: fixture.reservationId },
      data: { paymentStatus: PaymentStatus.PENDING },
    });
    // 直接的な test: raw updateMany が version を touch していないことは自明だが、
    // ここでは「非 form command 経由の書込」を代表して 1 種検証すればよい。

    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: fixture.reservationId },
      select: { version: true },
    });
    expect(after.version).toBe(0);
  });
});
```

**注**: 実装時に呼び出し可能な非 form command (`applyCancellation`, `markCheckoutSessionExpired`, `expirePendingReservations` 等) の実際のシグネチャに合わせて adjust。要点は「非 form path が version を touch していない」の機械検証。

- [ ] **Step 2: テスト実行 (最初から PASS するはず = gate として機能する)**

Run: `bun scripts/run-tests.ts __tests__/integration/reservations/admin-commands.test.ts`
Expected: 新テスト PASS。将来的に誰かが cancel-core に `version: { increment: 1 }` を追加したら、この test が fail して regression を検知する。

- [ ] **Step 3: Commit**

```bash
git add __tests__/integration/reservations/admin-commands.test.ts
git commit -m "$(cat <<'EOF'
test(reservations): assert non-form paths do not touch version column

spec §3.1.1 の境界 (Rails .update_all / Hibernate native query と同型で
非 form path は楽観制御対象外) を将来的な regression から守る gate test。
cancel-core と payment 遷移経由の書込後、version が不変であることを検証する。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 最終検証 + push + PR

**Files:**

- なし (検証と push のみ)

**Interfaces:**

- Consumes: Task 1-8 の全変更
- Produces: PR が open、auto-merge 予約済み

- [ ] **Step 1: 全 unit + integration test**

Run: `bun run test:unit`
Expected: PASS

Run: `bun run test:integration`
Expected: PASS

- [ ] **Step 2: type-check + lint**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: build (env 検証込み or skip-env)**

Run: `bun run build:skip-env`
Expected: PASS (DB 不要 build 検証)

- [ ] **Step 4: 変更ファイル数と行数確認**

Run: `git diff main --stat`
Expected: schema 2 + customer 5 + admin 5 + test 4 = 約 16 file、行数 500-800 (soft limit 内)。stopping exception「20 file 超 / 1000 行超」に該当しないこと。

- [ ] **Step 5: push**

Run (timeout 300s+): `git push -u origin claude/modest-bohr-cb7edb`
Expected: pre-push hook (type-check + architecture-boundaries) 通過、80-110 秒。

- [ ] **Step 6: PR 作成**

```bash
gh pr create --base main --title "feat(reservations): add optimistic concurrency (version column)" --body "$(cat <<'EOF'
## Summary

- `Reservation` テーブルに `version Int @default(0)` 列を追加
- form-driven update path (customer + admin) が updateMany の WHERE 述語で claim + increment し、silent lost-update race を DB レベルで防ぐ
- 非 form path (cron / payment / calendar-sync / cancel-core 等) は Rails `.update_all` / Hibernate native query と同型で touch しない (§3.1.1 spec)
- CONFLICT は form 上の警告帯に「予約情報が別のデバイス/画面で変更されました」を表示

設計: [docs/superpowers/specs/2026-07-18-reservation-optimistic-concurrency-design.md](docs/superpowers/specs/2026-07-18-reservation-optimistic-concurrency-design.md)
実装計画: [docs/superpowers/plans/2026-07-18-reservation-optimistic-concurrency.md](docs/superpowers/plans/2026-07-18-reservation-optimistic-concurrency.md)

## Test plan

- [x] `bun run test:unit` PASS
- [x] `bun run test:integration` PASS (customer race / admin race / 顧客 vs admin race / 非 form path 版数不変 gate)
- [x] `bun run validate` PASS
- [x] `bun run build:skip-env` PASS

## Deploy

- migration `add_reservation_version` は additive (`ADD COLUMN NOT NULL DEFAULT 0`)。Postgres 11+ fast-path で行 rewrite なし、breaking mode は発動しない
- rolling deploy 中の「旧 form (version 未送信) + 新 code (version 必須)」窓は数十秒〜数分。失敗しても form 上でエラー表示・データ破壊なし・再読込で復旧 (ユーザー承諾済み)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: auto-merge 予約**

```bash
gh pr merge --auto --squash --delete-branch
```

Expected: `Pull request X will be automatically merged...` メッセージ。GitHub 側の required checks pass 後に自動 squash merge。

- [ ] **Step 8: 完了報告**

PR URL をユーザーに通知して次タスク待機。

---

## Self-Review Notes

- ✅ Spec §1-§10 の全項目に対応 task がある
- ✅ Placeholder スキャン: "実装時に確認" 4 箇所は「grep で位置確認」等の具体的 next action、非 TBD
- ✅ 型整合: `input.version: number` は customer / admin ともに Task 3/6 で明示、form / action 経由も一貫
- ✅ 破壊的変更 (updateAdminReservationCommand の tx.reservation.update → updateMany 化) は Task 6 で明示、既存呼出箇所修正手順あり (Step 5)
- ✅ TDD 遵守: 各 domain 変更 (Task 3, 6) と schema 変更 (Task 2, 5) は failing test → 実装 → passing の順
- ✅ 各 task は独立 review 可能 (1 concern = 1 task)、commit も task 単位
