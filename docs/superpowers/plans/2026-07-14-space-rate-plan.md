# Space Rate Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** レンタルスペース予約サイトに業界標準の rate rule (曜日別 / 時間帯別 / 特定期間 / 祝日) システムを新設し、既存 3 件の bug (税 create 未書込 / 二重計算 / 単価snapshot欠如) と `Space.dailyPrice` 未使用カラム削除を同一 PR で解消する。

**Architecture:** Spacemarket 準拠の「基本料金 < 特別料金プラン」2 階層 override + last-updated-wins 優先度。予約時刻を JST 日境界と rate plan の時間帯境界で segment 分割し、per-segment に rate 解決。Reservation に `rateBreakdownJson` NOT NULL カラム追加で snapshot 保存 (Stripe/Airbnb pattern)。祝日は `@holiday-jp/holiday_jp` で判定。

**Tech Stack:** Prisma 7 + PostgreSQL 16 (breaking migration with backfill) / Next.js 16 App Router (`use cache` + `cacheTag`) / Zod 4 + conform (admin form) / bun test (per-file 隔離 runner) / Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-07-14-space-rate-plan-design.md`

## Global Constraints

- テストは必ず `bun scripts/run-tests.ts <path>` 経由で実行 (素の `bun test` は mock.module プロセス汚染で壊れる)。
- `bun run validate` はテストを含まない (type-check + lint のみ)。「テスト緑」は test コマンド実出力でのみ主張。
- Prisma import は `@/shared/db/prisma` からのみ。import する file は `import "server-only"` 必須。
- `src/app/*` から Prisma / `@generated/prisma` の直 import 禁止 (enum は `@/shared/lib/validations/enums/prisma-types` 経由)。
- `cacheComponents: true` のため route segment config 全面禁止。動的化は `await connection()` で。
- キャッシュタグの文字列直書き禁止。`CACHE_TAGS` (`src/shared/lib/constants/cache.ts:76`) + `CDN_CACHE_TAGS` (`src/shared/lib/constants/cdn-cache-tags.ts:33`) + `NEXTJS_TAG_TO_CDN_TAG` (`src/shared/lib/constants/cdn-cache-tags.ts:118`) 経由。
- `any` / non-null `!` / `@ts-ignore` / 危険 cast は grep gate で 0 件強制。
- 既存 `prisma/migrations/*/migration.sql` は編集禁止。修正は新規 migration で。
- 予約・イベントの空き/定員書込は `prisma.$transaction` 内で advisory lock を重複チェックより先に取得。
- `TermsAgreement` / `AuditLog` は append-only (update/delete 禁止)。
- 日付表示は `src/shared/lib/date-format.ts` の JST 固定 formatter を使う。
- main への push = 即・本番デプロイ。DROP / RENAME を含む migration は自動で計画ダウンタイム付きデプロイに切替。
- Bun 1.3.14 (packageManager が SSoT) / TypeScript 6.0.3 (exact pin)。
- 本 PR は既に承認済の破壊的変更を含む: `Space.dailyPrice` DROP、`Reservation.basePrice/totalPrice/rateBreakdownJson/taxRateType/taxRate/taxAmount/totalPriceWithTax` NOT NULL 化。ユーザー承認済。

---

### Task 1: 祝日 library 導入 + isJapaneseHoliday

**Files:**

- Add dep: `package.json` — `@holiday-jp/holiday_jp` 追加
- Create: `src/shared/lib/date/holiday.ts`
- Test: `__tests__/unit/lib/date/holiday.test.ts`

**Interfaces:**

- Consumes: `parseJstDateOnly` from `@/shared/lib/date-format`
- Produces: `isJapaneseHoliday(jstDateOnly: string): boolean` — "YYYY-MM-DD" (JST) を受け取り祝日判定

- [ ] **Step 1: dep 追加**

```bash
bun add @holiday-jp/holiday_jp
```

- [ ] **Step 2: 失敗する unit test を書く**

`__tests__/unit/lib/date/holiday.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";

describe("isJapaneseHoliday", () => {
  test("元日 (2026-01-01) は祝日", () => {
    expect(isJapaneseHoliday("2026-01-01")).toBe(true);
  });

  test("こどもの日 (2026-05-05) は祝日", () => {
    expect(isJapaneseHoliday("2026-05-05")).toBe(true);
  });

  test("平日 (2026-01-05 月) は非祝日", () => {
    expect(isJapaneseHoliday("2026-01-05")).toBe(false);
  });

  test("土曜日 (2026-01-03) は非祝日 (曜日と祝日は独立軸)", () => {
    expect(isJapaneseHoliday("2026-01-03")).toBe(false);
  });

  test("振替休日 (2027-05-05 水 → 2027-05-06 木 は該当なしケース)", () => {
    // 2026 年時点の実データで判定
    // 2026 GW: 5/3 日 (憲法記念日), 5/4 月 (みどりの日), 5/5 火 (こどもの日) — 振替なし
    expect(isJapaneseHoliday("2026-05-06")).toBe(false);
  });
});
```

- [ ] **Step 3: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/date/holiday.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 4: 実装**

`src/shared/lib/date/holiday.ts`:

```ts
import "server-only";
import * as holidayJp from "@holiday-jp/holiday_jp";
import { parseJstDateOnly } from "@/shared/lib/date-format";

export function isJapaneseHoliday(jstDateOnly: string): boolean {
  const date = parseJstDateOnly(jstDateOnly);
  return holidayJp.isHoliday(date);
}
```

- [ ] **Step 5: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/date/holiday.test.ts
```

Expected: PASS (5/5)

- [ ] **Step 6: type-check**

```bash
bun run validate
```

Expected: exit 0

- [ ] **Step 7: commit**

```bash
git add package.json bun.lock src/shared/lib/date/holiday.ts __tests__/unit/lib/date/holiday.test.ts
git commit -m "feat(date): add isJapaneseHoliday using @holiday-jp/holiday_jp"
```

---

### Task 2: RateBreakdown Zod schema

**Files:**

- Create: `src/shared/lib/pricing/rate-breakdown.ts`
- Test: `__tests__/unit/lib/pricing/rate-breakdown.test.ts`

**Interfaces:**

- Produces: `rateBreakdownSchema` (Zod), `RateBreakdown` type, `LegacyRateBreakdown` type detection helper `isLegacyRateBreakdown(json: unknown): boolean`

- [ ] **Step 1: 失敗する unit test を書く**

`__tests__/unit/lib/pricing/rate-breakdown.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  rateBreakdownSchema,
  isLegacyRateBreakdown,
} from "@/shared/lib/pricing/rate-breakdown";

describe("rateBreakdownSchema", () => {
  test("valid full breakdown", () => {
    const valid = {
      schemaVersion: 1,
      segments: [
        {
          fromIso: "2026-07-15T10:00:00+09:00",
          toIso: "2026-07-15T12:00:00+09:00",
          hours: 2,
          hourlyPrice: 2000,
          subtotal: 4000,
          ratePlanId: null,
          ratePlanName: "基本料金",
          isHoliday: false,
        },
      ],
      totalHours: 2,
      totalBasePrice: 4000,
      holidayFlags: {},
    };
    expect(rateBreakdownSchema.parse(valid)).toEqual(valid);
  });

  test("legacy breakdown も parse できる (legacy フラグ許容)", () => {
    const legacy = {
      schemaVersion: 1,
      segments: [],
      totalHours: 0,
      totalBasePrice: 0,
      holidayFlags: {},
      legacy: true,
    };
    expect(() => rateBreakdownSchema.parse(legacy)).not.toThrow();
  });

  test("schemaVersion !== 1 は reject", () => {
    expect(() =>
      rateBreakdownSchema.parse({
        schemaVersion: 2,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      }),
    ).toThrow();
  });

  test("segments が array でない場合 reject", () => {
    expect(() =>
      rateBreakdownSchema.parse({
        schemaVersion: 1,
        segments: null,
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      }),
    ).toThrow();
  });
});

describe("isLegacyRateBreakdown", () => {
  test("legacy: true フラグを検知", () => {
    expect(isLegacyRateBreakdown({ schemaVersion: 1, legacy: true })).toBe(
      true,
    );
  });

  test("legacy フラグなしは false", () => {
    expect(
      isLegacyRateBreakdown({ schemaVersion: 1, segments: [{ hours: 2 }] }),
    ).toBe(false);
  });

  test("null / 不正な入力は true (念のため fallback 経路に載せる)", () => {
    expect(isLegacyRateBreakdown(null)).toBe(true);
    expect(isLegacyRateBreakdown(undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/pricing/rate-breakdown.test.ts
```

- [ ] **Step 3: 実装**

`src/shared/lib/pricing/rate-breakdown.ts`:

```ts
import { z } from "zod";

export const rateBreakdownSegmentSchema = z.object({
  fromIso: z.string(),
  toIso: z.string(),
  hours: z.number(),
  hourlyPrice: z.number().int(),
  subtotal: z.number().int(),
  ratePlanId: z.string().nullable(),
  ratePlanName: z.string(),
  isHoliday: z.boolean(),
});

export const rateBreakdownSchema = z
  .object({
    schemaVersion: z.literal(1),
    segments: z.array(rateBreakdownSegmentSchema),
    totalHours: z.number(),
    totalBasePrice: z.number().int(),
    holidayFlags: z.record(z.string(), z.literal(true)),
    legacy: z.boolean().optional(),
  })
  .strict();

export type RateBreakdown = z.infer<typeof rateBreakdownSchema>;
export type RateBreakdownSegment = z.infer<typeof rateBreakdownSegmentSchema>;

export function isLegacyRateBreakdown(json: unknown): boolean {
  if (json == null || typeof json !== "object") return true;
  return "legacy" in json && (json as { legacy?: unknown }).legacy === true;
}
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/pricing/rate-breakdown.test.ts
```

- [ ] **Step 5: commit**

```bash
git add src/shared/lib/pricing/rate-breakdown.ts __tests__/unit/lib/pricing/rate-breakdown.test.ts
git commit -m "feat(pricing): add RateBreakdown Zod schema with legacy flag support"
```

---

### Task 3: Prisma schema + migration + backfill

**Files:**

- Modify: `prisma/schema.prisma` (Space.dailyPrice DROP, Reservation NOT NULL 化, 新規 SpaceRatePlan + DayOfWeek + HolidayMode)
- Create: `prisma/migrations/<timestamp>_add_space_rate_plan/migration.sql` (auto + 手動 backfill)
- Regenerate: `generated/prisma/*` (`bun run db:generate`)

**Interfaces:**

- Produces: `SpaceRatePlan` Prisma model, `DayOfWeek` + `HolidayMode` enum, `Reservation.rateBreakdownJson` NOT NULL

- [ ] **Step 1: schema.prisma を編集**

spec の Section 「1. Data model (Prisma DSL)」の内容を `prisma/schema.prisma` に反映:

- `enum DayOfWeek` を既存 enum 群 (line 51 周辺) の末尾に追加
- `enum HolidayMode` を追加
- `Space` model: `dailyPrice` 行を削除、`ratePlans SpaceRatePlan[]` relation を追加
- `Reservation` model: `basePrice/totalPrice/taxRateType/taxRate/taxAmount/totalPriceWithTax` を NOT NULL 化 (`?` 除去)、`rateBreakdownJson Json` (NOT NULL) を追加、`priceOverriddenBy String?` を追加
- 新規 `model SpaceRatePlan` を Space model の直下に追加 (spec の DSL をそのまま貼り付け)

**注意**: Prisma で `@@check` は Postgres でしか動かない (raw SQL check constraint)。今回対象は PostgreSQL なので使える。ただし Prisma 7 で `@@check` が supported か念のため確認 (未対応なら migration.sql に手書きで CHECK を追加)。

- [ ] **Step 2: dev DB で migrate 実行**

```bash
bun run db:migrate --name add_space_rate_plan
```

Expected: `prisma/migrations/<timestamp>_add_space_rate_plan/migration.sql` が生成される。

- [ ] **Step 3: migration.sql に手動 backfill を追加**

自動生成された migration.sql の末尾に、NOT NULL 制約追加の直前に以下を挿入:

```sql
-- Backfill: 既存 Reservation 行の必須化予定カラムを埋める
DO $$
DECLARE
  standard_rate DECIMAL(5,2);
BEGIN
  SELECT "taxStandardRate" INTO standard_rate FROM "Settings" LIMIT 1;
  standard_rate := COALESCE(standard_rate, 10);

  UPDATE "Reservation"
  SET
    "taxRateType" = COALESCE("taxRateType", 'standard'::"TaxRateType"),
    "taxRate" = COALESCE("taxRate", standard_rate),
    "basePrice" = COALESCE("basePrice", COALESCE("totalPrice", 0)),
    "totalPrice" = COALESCE("totalPrice", 0),
    "taxAmount" = COALESCE("taxAmount", ROUND(COALESCE("totalPrice", 0) * COALESCE("taxRate", standard_rate) / 100)::int),
    "totalPriceWithTax" = COALESCE("totalPriceWithTax", COALESCE("totalPrice", 0) + COALESCE("taxAmount", ROUND(COALESCE("totalPrice", 0) * COALESCE("taxRate", standard_rate) / 100)::int)),
    "rateBreakdownJson" = COALESCE(
      "rateBreakdownJson",
      jsonb_build_object(
        'schemaVersion', 1,
        'segments', '[]'::jsonb,
        'totalHours', 0,
        'totalBasePrice', 0,
        'holidayFlags', '{}'::jsonb,
        'legacy', true
      )
    );
END $$;
```

そして NOT NULL 制約追加 SQL (auto-generated) がその後に来る順序を確認。順序が逆なら手動並べ替え。

- [ ] **Step 4: Prisma client 再生成**

```bash
bun run db:generate
```

- [ ] **Step 5: squawk lint 実行**

```bash
# 該当 script があるか確認
grep -r "squawk" package.json .lefthook* .claude 2>/dev/null | head -3
```

squawk がプロジェクトで設定されていれば `bun run lint:sql` または同等コマンドで実行。breaking migration の警告は expected なので、`.claude/skills/prisma-migration` の指示に従い breaking migration ドキュメントに追記。

- [ ] **Step 6: migration 検証 (integration test 準備)**

```bash
bun run test:integration __tests__/integration/reservations/ 2>&1 | tail -20
```

Prisma client 型が正しく更新されていれば既存テストが通る (rate plan 未対応の状態でも Reservation NOT NULL 化 に対する fixture 側の更新が必要になる可能性あり — その場合は Task 8 の integration test 段階で対応する)。

- [ ] **Step 7: commit**

```bash
git add prisma/schema.prisma prisma/migrations/ generated/prisma/
git commit -m "feat(db): add SpaceRatePlan model with backfill migration (breaking)"
```

---

### Task 4: Rate plan resolver (pure function)

**Files:**

- Create: `src/shared/lib/pricing/rate-plan-resolver.ts`
- Test: `__tests__/unit/lib/pricing/rate-plan-resolver.test.ts`

**Interfaces:**

- Consumes: `RateBreakdown` from Task 2, `DayOfWeek` / `HolidayMode` from Task 3 (Prisma generated)
- Produces:
  - `type SpaceRatePlanForResolver = { id: string; name: string; hourlyPrice: number; daysOfWeek: DayOfWeek[]; holidayMode: HolidayMode; startTime: string | null; endTime: string | null; effectiveFrom: Date | null; effectiveTo: Date | null; updatedAt: Date }`
  - `type ResolveRateInput = { ratePlans: SpaceRatePlanForResolver[]; spaceHourlyPrice: number; startDateTime: Date; endDateTime: Date; holidayJudge: (jstDateOnly: string) => boolean }`
  - `function resolveRateBreakdown(input: ResolveRateInput): RateBreakdown`

- [ ] **Step 1: 失敗する unit test を書く (代表 10 ケース)**

`__tests__/unit/lib/pricing/rate-plan-resolver.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  resolveRateBreakdown,
  type SpaceRatePlanForResolver,
} from "@/shared/lib/pricing/rate-plan-resolver";

// JST Date helper: "YYYY-MM-DDTHH:mm" → Date (JST wall clock を UTC 相当に)
const jst = (iso: string) => new Date(`${iso}:00+09:00`);

// Rate plan factory
const plan = (
  partial: Partial<SpaceRatePlanForResolver>,
): SpaceRatePlanForResolver => ({
  id: "p1",
  name: "test",
  hourlyPrice: 3000,
  daysOfWeek: [],
  holidayMode: "any",
  startTime: null,
  endTime: null,
  effectiveFrom: null,
  effectiveTo: null,
  updatedAt: new Date("2026-01-01"),
  ...partial,
});

const noHoliday = () => false;

describe("resolveRateBreakdown", () => {
  test("rate plan 空 → Space.hourlyPrice フォールバック", () => {
    const result = resolveRateBreakdown({
      ratePlans: [],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].hourlyPrice).toBe(2000);
    expect(result.segments[0].ratePlanId).toBe(null);
    expect(result.segments[0].ratePlanName).toBe("基本料金");
    expect(result.totalBasePrice).toBe(4000);
    expect(result.totalHours).toBe(2);
  });

  test("曜日別: 金曜のみ適用", () => {
    const fridayPlan = plan({
      id: "f",
      name: "金曜料金",
      hourlyPrice: 4000,
      daysOfWeek: ["FRIDAY"],
    });
    const result = resolveRateBreakdown({
      ratePlans: [fridayPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T10:00"), // 2026-07-17 は金曜
      endDateTime: jst("2026-07-17T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].hourlyPrice).toBe(4000);
    expect(result.segments[0].ratePlanId).toBe("f");
  });

  test("時間帯別: 18:00-22:00 のみ適用", () => {
    const eveningPlan = plan({
      id: "e",
      name: "夜料金",
      hourlyPrice: 5000,
      startTime: "18:00",
      endTime: "22:00",
    });
    const result = resolveRateBreakdown({
      ratePlans: [eveningPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-15T16:00"),
      endDateTime: jst("2026-07-15T20:00"),
      holidayJudge: noHoliday,
    });
    // 16-18: 基本料金, 18-20: 夜料金
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].hourlyPrice).toBe(2000);
    expect(result.segments[1].hourlyPrice).toBe(5000);
    expect(result.totalBasePrice).toBe(2000 * 2 + 5000 * 2);
  });

  test("深夜跨ぎ: 金 22:00 - 土 02:00 → 2 segment 分割", () => {
    const weekendPlan = plan({
      id: "w",
      name: "土曜料金",
      hourlyPrice: 4000,
      daysOfWeek: ["SATURDAY"],
    });
    const result = resolveRateBreakdown({
      ratePlans: [weekendPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T22:00"), // 金 22:00
      endDateTime: jst("2026-07-18T02:00"), // 土 02:00
      holidayJudge: noHoliday,
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].hourlyPrice).toBe(2000); // 金 22-24
    expect(result.segments[1].hourlyPrice).toBe(4000); // 土 00-02
  });

  test("特定期間: effectiveFrom / effectiveTo 外は非適用", () => {
    const gwPlan = plan({
      id: "gw",
      name: "GW",
      hourlyPrice: 6000,
      effectiveFrom: new Date("2026-05-01"),
      effectiveTo: new Date("2026-05-06"),
    });
    const result = resolveRateBreakdown({
      ratePlans: [gwPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].ratePlanId).toBe(null); // 期間外
  });

  test("祝日 only: 祝日のみ適用", () => {
    const holidayPlan = plan({
      id: "h",
      name: "祝日料金",
      hourlyPrice: 5000,
      holidayMode: "only",
    });
    // 2026-05-05 (火) は祝日
    const result = resolveRateBreakdown({
      ratePlans: [holidayPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-05-05T10:00"),
      endDateTime: jst("2026-05-05T12:00"),
      holidayJudge: (d) => d === "2026-05-05",
    });
    expect(result.segments[0].hourlyPrice).toBe(5000);
    expect(result.holidayFlags["2026-05-05"]).toBe(true);
  });

  test("祝日 exclude: 祝日は非適用", () => {
    const weekdayPlan = plan({
      id: "wd",
      name: "平日料金",
      hourlyPrice: 3000,
      holidayMode: "exclude",
    });
    const result = resolveRateBreakdown({
      ratePlans: [weekdayPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-05-05T10:00"), // 祝日
      endDateTime: jst("2026-05-05T12:00"),
      holidayJudge: (d) => d === "2026-05-05",
    });
    expect(result.segments[0].ratePlanId).toBe(null); // 祝日除外で fallback
  });

  test("優先度: 2 plan が同時マッチ → updatedAt 新しい方採用", () => {
    const oldPlan = plan({
      id: "old",
      name: "旧金曜料金",
      hourlyPrice: 3000,
      daysOfWeek: ["FRIDAY"],
      updatedAt: new Date("2026-01-01"),
    });
    const newPlan = plan({
      id: "new",
      name: "新金曜料金",
      hourlyPrice: 5000,
      daysOfWeek: ["FRIDAY"],
      updatedAt: new Date("2026-06-01"),
    });
    const result = resolveRateBreakdown({
      ratePlans: [oldPlan, newPlan], // 順序に依存しない (関数内でソート)
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T10:00"), // 金
      endDateTime: jst("2026-07-17T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].ratePlanId).toBe("new");
    expect(result.segments[0].hourlyPrice).toBe(5000);
  });

  test("複合条件 (金曜 AND 18-22時) + segment 分割", () => {
    const combo = plan({
      id: "c",
      name: "金夜料金",
      hourlyPrice: 6000,
      daysOfWeek: ["FRIDAY"],
      startTime: "18:00",
      endTime: "22:00",
    });
    const result = resolveRateBreakdown({
      ratePlans: [combo],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T16:00"), // 金 16:00
      endDateTime: jst("2026-07-18T00:00"), // 土 00:00
      holidayJudge: noHoliday,
    });
    // 金16-18: 基本, 金18-22: 金夜, 金22-24: 基本 (土は 00:00 で境界 exclusive)
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].hourlyPrice).toBe(2000);
    expect(result.segments[1].hourlyPrice).toBe(6000);
    expect(result.segments[2].hourlyPrice).toBe(2000);
    expect(result.totalHours).toBe(8);
  });

  test("Math.floor 丸め: hourlyPrice 3333 × 1.5h = 4999", () => {
    const result = resolveRateBreakdown({
      ratePlans: [],
      spaceHourlyPrice: 3333,
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T11:30"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].subtotal).toBe(4999); // Math.floor(3333 * 1.5)
    expect(result.totalBasePrice).toBe(4999);
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/pricing/rate-plan-resolver.test.ts
```

- [ ] **Step 3: 実装**

`src/shared/lib/pricing/rate-plan-resolver.ts`:

```ts
import {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";
import type {
  RateBreakdown,
  RateBreakdownSegment,
} from "@/shared/lib/pricing/rate-breakdown";

export type SpaceRatePlanForResolver = {
  id: string;
  name: string;
  hourlyPrice: number;
  daysOfWeek: DayOfWeek[];
  holidayMode: HolidayMode;
  startTime: string | null; // "HH:MM"
  endTime: string | null; // "HH:MM"、null = 24:00
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  updatedAt: Date;
};

export type ResolveRateInput = {
  ratePlans: SpaceRatePlanForResolver[];
  spaceHourlyPrice: number;
  startDateTime: Date;
  endDateTime: Date;
  holidayJudge: (jstDateOnly: string) => boolean;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const DAY_INDEX_TO_ENUM: Record<number, DayOfWeek> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

/** JST での "HH:MM" を分に変換。null は 00:00 or 24:00 (endMode) */
function timeStrToMinutes(t: string | null, endMode: boolean): number {
  if (t === null) return endMode ? 24 * 60 : 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Date を JST の epoch minutes に変換 (day boundary 判定用) */
function toJstMinutes(d: Date): number {
  return Math.floor((d.getTime() + JST_OFFSET_MS) / (60 * 1000));
}

/** JST minutes → "YYYY-MM-DD" */
function jstMinutesToDateOnly(m: number): string {
  const utcMs = m * 60 * 1000 - JST_OFFSET_MS;
  const d = new Date(utcMs + JST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** JST minutes → 曜日 index (0=日) */
function jstMinutesToDayIndex(m: number): number {
  const utcMs = m * 60 * 1000 - JST_OFFSET_MS;
  const d = new Date(utcMs + JST_OFFSET_MS);
  return d.getUTCDay();
}

/** JST minutes → JST wall clock の "その日の 00:00 からの分" */
function jstMinutesToTimeOfDayMinutes(m: number): number {
  return ((m % (24 * 60)) + 24 * 60) % (24 * 60);
}

/** JST minutes → ISO8601 (+09:00) */
function jstMinutesToIso(m: number): string {
  const utcMs = m * 60 * 1000 - JST_OFFSET_MS;
  const d = new Date(utcMs);
  return d.toISOString().replace("Z", "+00:00"); // UTC 表現、but Date に +09:00 を戻す
}

/** ISO 表現を素直に (JST) 保つ helper */
function toIsoJst(m: number): string {
  const utcMs = m * 60 * 1000 - JST_OFFSET_MS;
  const d = new Date(utcMs);
  // JST wall clock を +09:00 サフィックスで表現
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  // getUTCHours は JST wall clock を表現しない — 修正
  // ここでは utcMs は "JST wall clock を UTC 相当に表現した値" になっている
  // つまり d.getUTC* は JST wall clock を返す
  return `${y}-${mo}-${day}T${hh}:${mm}:00+09:00`;
}

export function resolveRateBreakdown(input: ResolveRateInput): RateBreakdown {
  const startMin = toJstMinutes(input.startDateTime);
  const endMin = toJstMinutes(input.endDateTime);

  // 1. 分割候補点を集める
  const cutPoints = new Set<number>([startMin, endMin]);

  // 日境界 (JST 00:00)
  const startDay = Math.floor(startMin / (24 * 60));
  const endDay = Math.floor((endMin - 1) / (24 * 60));
  for (let day = startDay + 1; day <= endDay; day++) {
    cutPoints.add(day * 24 * 60);
  }

  // 時間帯境界: 各 rate plan の startTime/endTime を該当日の JST datetime に展開
  for (let day = startDay; day <= endDay; day++) {
    for (const plan of input.ratePlans) {
      const startTod = timeStrToMinutes(plan.startTime, false);
      const endTod = timeStrToMinutes(plan.endTime, true);
      const dayStart = day * 24 * 60;
      const boundaryStart = dayStart + startTod;
      const boundaryEnd = dayStart + endTod;
      if (boundaryStart > startMin && boundaryStart < endMin)
        cutPoints.add(boundaryStart);
      if (boundaryEnd > startMin && boundaryEnd < endMin)
        cutPoints.add(boundaryEnd);
    }
  }

  // 2. ソートして segment を生成
  const sortedCuts = [...cutPoints].sort((a, b) => a - b);
  const segments: RateBreakdownSegment[] = [];
  const holidayFlags: Record<string, true> = {};

  // rate plans を updatedAt DESC でソート
  const plansSorted = [...input.ratePlans].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  for (let i = 0; i < sortedCuts.length - 1; i++) {
    const segStart = sortedCuts[i];
    const segEnd = sortedCuts[i + 1];
    if (segEnd <= segStart) continue;

    const segStartDateOnly = jstMinutesToDateOnly(segStart);
    const segStartDayIndex = jstMinutesToDayIndex(segStart);
    const segStartDayEnum = DAY_INDEX_TO_ENUM[segStartDayIndex];
    const segStartTod = jstMinutesToTimeOfDayMinutes(segStart);
    const isHoliday = input.holidayJudge(segStartDateOnly);
    if (isHoliday) holidayFlags[segStartDateOnly] = true;

    // matching plan を検索
    const matched = plansSorted.find((plan) => {
      // 曜日
      if (
        plan.daysOfWeek.length > 0 &&
        !plan.daysOfWeek.includes(segStartDayEnum)
      )
        return false;
      // 祝日 mode
      if (plan.holidayMode === "only" && !isHoliday) return false;
      if (plan.holidayMode === "exclude" && isHoliday) return false;
      // 時間帯
      const planStartTod = timeStrToMinutes(plan.startTime, false);
      const planEndTod = timeStrToMinutes(plan.endTime, true);
      if (segStartTod < planStartTod || segStartTod >= planEndTod) return false;
      // 有効期間
      if (plan.effectiveFrom) {
        const fromDateOnly = plan.effectiveFrom.toISOString().slice(0, 10);
        if (segStartDateOnly < fromDateOnly) return false;
      }
      if (plan.effectiveTo) {
        const toDateOnly = plan.effectiveTo.toISOString().slice(0, 10);
        if (segStartDateOnly > toDateOnly) return false;
      }
      return true;
    });

    const hourlyPrice = matched?.hourlyPrice ?? input.spaceHourlyPrice;
    const ratePlanId = matched?.id ?? null;
    const ratePlanName = matched?.name ?? "基本料金";
    const hours = (segEnd - segStart) / 60;
    const subtotal = Math.floor(hourlyPrice * hours);

    segments.push({
      fromIso: toIsoJst(segStart),
      toIso: toIsoJst(segEnd),
      hours,
      hourlyPrice,
      subtotal,
      ratePlanId,
      ratePlanName,
      isHoliday,
    });
  }

  const totalHours = segments.reduce((sum, s) => sum + s.hours, 0);
  const totalBasePrice = segments.reduce((sum, s) => sum + s.subtotal, 0);

  return {
    schemaVersion: 1,
    segments,
    totalHours,
    totalBasePrice,
    holidayFlags,
  };
}
```

**注意**: JST を UTC 相当で扱う trick は既存 code (`src/shared/lib/date-format.ts`) に前例あり。念のため既存 pattern と一致するか実装前に確認する。

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/pricing/rate-plan-resolver.test.ts
```

Expected: 10/10 PASS

- [ ] **Step 5: commit**

```bash
git add src/shared/lib/pricing/rate-plan-resolver.ts __tests__/unit/lib/pricing/rate-plan-resolver.test.ts
git commit -m "feat(pricing): add rate plan resolver with segment split and last-updated-wins priority"
```

---

### Task 5: Cache tags + rate plan queries

**Files:**

- Modify: `src/shared/lib/constants/cache.ts` (CACHE_TAGS.SPACE_RATE_PLANS 追加)
- Modify: `src/shared/lib/constants/cdn-cache-tags.ts` (CDN_CACHE_TAGS + NEXTJS_TAG_TO_CDN_TAG)
- Create: `src/shared/domain/spaces/rate-plan-queries.ts` (`getSpaceRatePlans` with `'use cache'`)
- Modify: `src/shared/lib/cache/reservation-cache.ts` or 該当 cache invalidation module (rate plan 変更時の tag invalidate helper 追加)

**Interfaces:**

- Produces: `CACHE_TAGS.SPACE_RATE_PLANS(spaceId): string`, `getSpaceRatePlans(spaceId): Promise<SpaceRatePlanForResolver[]>`

- [ ] **Step 1: CACHE_TAGS 追加**

`src/shared/lib/constants/cache.ts` の CACHE_TAGS object の既存 SPACES 等の周辺に追加:

```ts
SPACE_RATE_PLANS: (spaceId: string) => `space:${spaceId}:rate-plans`,
```

同時に該当箇所の型 (getCacheTag helper 側) を確認、必要ならジェネリック引数追加。

- [ ] **Step 2: CDN mapping 追加**

`src/shared/lib/constants/cdn-cache-tags.ts` の CDN_CACHE_TAGS と NEXTJS_TAG_TO_CDN_TAG:

```ts
// CDN_CACHE_TAGS 内
SPACE_RATE_PLANS: "space-rate-plans",

// NEXTJS_TAG_TO_CDN_TAG 内
"space:*:rate-plans": CDN_CACHE_TAGS.SPACE_RATE_PLANS,
```

wildcard `space:*:rate-plans` 形式が既存 pattern (`SPACES` 等の CDN mapping) に合致するか確認。既存に `space:*` があるなら `space:*:rate-plans` は別 tag として分離する必要あるか判断。

- [ ] **Step 3: 失敗する unit test (drift gate 側)**

architecture-boundaries.test.ts で `SPACE_RATE_PLANS` producer と CDN mapping の存在確認テストが自動的に走る (既存 pattern)。まず該当テストが要求する規約を満たすか確認するため:

```bash
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts 2>&1 | grep -i "rate.plan\|SPACE_RATE" | head -10
```

- [ ] **Step 4: getSpaceRatePlans 実装**

`src/shared/domain/spaces/rate-plan-queries.ts`:

```ts
import "server-only";
import { unstable_cacheTag as cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_TAGS } from "@/shared/lib/constants/cache";
import type { SpaceRatePlanForResolver } from "@/shared/lib/pricing/rate-plan-resolver";

export async function getSpaceRatePlans(
  spaceId: string,
): Promise<SpaceRatePlanForResolver[]> {
  "use cache";
  cacheTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId));

  const rows = await prisma.spaceRatePlan.findMany({
    where: { spaceId },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    hourlyPrice: r.hourlyPrice.toNumber(),
    daysOfWeek: r.daysOfWeek,
    holidayMode: r.holidayMode,
    startTime: r.startTime,
    endTime: r.endTime,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    updatedAt: r.updatedAt,
  }));
}
```

- [ ] **Step 5: cache invalidation helper 追加**

`src/shared/lib/cache/reservation-cache.ts` (or 新規 `space-rate-plan-cache.ts`) に:

```ts
export function invalidateSpaceRatePlansCache(spaceId: string): void {
  updateTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId));
}
```

- [ ] **Step 6: validate**

```bash
bun run validate
```

- [ ] **Step 7: commit**

```bash
git add src/shared/lib/constants/cache.ts src/shared/lib/constants/cdn-cache-tags.ts src/shared/domain/spaces/rate-plan-queries.ts src/shared/lib/cache/
git commit -m "feat(cache): add SPACE_RATE_PLANS tag and getSpaceRatePlans query"
```

---

### Task 6: Rate plan CRUD command (domain)

**Files:**

- Create: `src/shared/domain/spaces/rate-plan-commands.ts`
- Test: `__tests__/integration/spaces/rate-plan-commands.test.ts`

**Interfaces:**

- Produces:
  - `createSpaceRatePlan(input: CreateSpaceRatePlanInput): Promise<SpaceRatePlan>`
  - `updateSpaceRatePlan(id: string, input: UpdateSpaceRatePlanInput): Promise<SpaceRatePlan>`
  - `deleteSpaceRatePlan(id: string): Promise<void>`
  - 各関数は cache invalidation を副作用として呼ぶ

- [ ] **Step 1: failing integration test を書く**

`__tests__/integration/spaces/rate-plan-commands.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { prisma } from "@/shared/db/prisma";
import {
  createSpaceRatePlan,
  updateSpaceRatePlan,
  deleteSpaceRatePlan,
} from "@/shared/domain/spaces/rate-plan-commands";
import { seedSpaceForTest } from "__tests__/integration/_helpers/seed"; // 既存 helper (要確認、なければ inline seed)

describe("SpaceRatePlan CRUD", () => {
  let spaceId: string;

  beforeEach(async () => {
    const space = await seedSpaceForTest();
    spaceId = space.id;
  });

  test("createSpaceRatePlan: 基本 field で作成できる", async () => {
    const plan = await createSpaceRatePlan({
      spaceId,
      name: "金曜料金",
      hourlyPrice: 4000,
      daysOfWeek: ["FRIDAY"],
      holidayMode: "any",
      startTime: null,
      endTime: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    expect(plan.name).toBe("金曜料金");
    expect(plan.hourlyPrice.toNumber()).toBe(4000);

    const found = await prisma.spaceRatePlan.findUnique({
      where: { id: plan.id },
    });
    expect(found).not.toBeNull();
  });

  test("updateSpaceRatePlan: updatedAt が bump される (last-updated-wins)", async () => {
    const plan = await createSpaceRatePlan({
      spaceId,
      name: "初期",
      hourlyPrice: 3000,
      daysOfWeek: [],
      holidayMode: "any",
      startTime: null,
      endTime: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    const initialUpdatedAt = plan.updatedAt;

    await new Promise((r) => setTimeout(r, 10)); // updatedAt 差分確保

    const updated = await updateSpaceRatePlan(plan.id, { hourlyPrice: 5000 });
    expect(updated.hourlyPrice.toNumber()).toBe(5000);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      initialUpdatedAt.getTime(),
    );
  });

  test("deleteSpaceRatePlan: 削除される", async () => {
    const plan = await createSpaceRatePlan({
      spaceId,
      name: "削除対象",
      hourlyPrice: 3000,
      daysOfWeek: [],
      holidayMode: "any",
      startTime: null,
      endTime: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    await deleteSpaceRatePlan(plan.id);
    const found = await prisma.spaceRatePlan.findUnique({
      where: { id: plan.id },
    });
    expect(found).toBeNull();
  });

  test("Space 削除で cascade される", async () => {
    const plan = await createSpaceRatePlan({
      spaceId,
      name: "cascade test",
      hourlyPrice: 3000,
      daysOfWeek: [],
      holidayMode: "any",
      startTime: null,
      endTime: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    await prisma.space.delete({ where: { id: spaceId } });
    const found = await prisma.spaceRatePlan.findUnique({
      where: { id: plan.id },
    });
    expect(found).toBeNull();
  });
});
```

**注意**: `seedSpaceForTest` helper が既存にあるか要確認。無ければ test file 内で `prisma.space.create` を直呼び (Location/Settings 依存があるので既存 integration test の pattern を模倣)。

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun run test:integration __tests__/integration/spaces/rate-plan-commands.test.ts
```

- [ ] **Step 3: 実装**

`src/shared/domain/spaces/rate-plan-commands.ts`:

```ts
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { invalidateSpaceRatePlansCache } from "@/shared/lib/cache/space-rate-plan-cache";
import type {
  DayOfWeek,
  HolidayMode,
  SpaceRatePlan,
} from "@/shared/lib/validations/enums/prisma-types";

export type CreateSpaceRatePlanInput = {
  spaceId: string;
  name: string;
  hourlyPrice: number;
  daysOfWeek: DayOfWeek[];
  holidayMode: HolidayMode;
  startTime: string | null;
  endTime: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

export type UpdateSpaceRatePlanInput = Partial<
  Omit<CreateSpaceRatePlanInput, "spaceId">
>;

export async function createSpaceRatePlan(
  input: CreateSpaceRatePlanInput,
): Promise<SpaceRatePlan> {
  const plan = await prisma.spaceRatePlan.create({
    data: input,
  });
  invalidateSpaceRatePlansCache(input.spaceId);
  return plan;
}

export async function updateSpaceRatePlan(
  id: string,
  input: UpdateSpaceRatePlanInput,
): Promise<SpaceRatePlan> {
  const plan = await prisma.spaceRatePlan.update({
    where: { id },
    data: input,
  });
  invalidateSpaceRatePlansCache(plan.spaceId);
  return plan;
}

export async function deleteSpaceRatePlan(id: string): Promise<void> {
  const plan = await prisma.spaceRatePlan.delete({
    where: { id },
    select: { spaceId: true },
  });
  invalidateSpaceRatePlansCache(plan.spaceId);
}
```

- [ ] **Step 4: test 実行 → pass 確認**

```bash
bun run test:integration __tests__/integration/spaces/rate-plan-commands.test.ts
```

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/spaces/rate-plan-commands.ts __tests__/integration/spaces/rate-plan-commands.test.ts
git commit -m "feat(domain): add SpaceRatePlan CRUD commands with cache invalidation"
```

---

### Task 7: Pricing 統合関数 (calculateReservationPricing + reservation.ts refactor)

**Files:**

- Modify: `src/shared/lib/pricing/reservation.ts` (`calculatePricing` を basePrice 直接受け取り形に refactor、hourlyPrice × hours 削除)
- Create: `src/shared/lib/pricing/calculate-reservation-pricing.ts` (統合 entry point)
- Modify: `src/shared/domain/reservations/payloads.ts` (`calculateHoursAndBasePrice` 削除)
- Test: `__tests__/unit/lib/pricing/calculate-reservation-pricing.test.ts` (新規)、既存 `reservation.test.ts` の update

**Interfaces:**

- Consumes: `resolveRateBreakdown`, `SpaceRatePlanForResolver`, tax helpers from `tax.ts`, existing discount helpers from `discount.ts`
- Produces:
  - `type ReservationPricingInput = { startDateTime; endDateTime; space: { hourlyPrice; discountType; discountValue; durationDiscountOverride; taxRateType }; ratePlans: SpaceRatePlanForResolver[]; reservationSettings: {...}; coupon?; holidayJudge }`
  - `function calculateReservationPricing(input): { rateBreakdown; basePrice; totalPrice; spaceDiscountAmount; durationDiscountAmount; couponDiscountAmount; taxRateType; taxRate; taxAmount; totalPriceWithTax }`

- [ ] **Step 1: failing unit test を書く**

`__tests__/unit/lib/pricing/calculate-reservation-pricing.test.ts` (代表 3 ケース):

```ts
import { describe, expect, test } from "bun:test";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";

const jst = (iso: string) => new Date(`${iso}:00+09:00`);
const noHoliday = () => false;

const baseSpace = {
  hourlyPrice: 2000,
  discountType: "none" as const,
  discountValue: null,
  durationDiscountOverride: "inherit" as const,
  taxRateType: "standard" as const,
};

const baseSettings = {
  taxStandardRate: 10,
  taxReducedRate: 8,
  taxDisplayModePublic: "tax_included" as const,
  durationDiscountEnabled: false,
  durationDiscountRules: null,
  discountCombinationMode: "best" as const,
  showOriginalPrice: false,
};

describe("calculateReservationPricing", () => {
  test("rate plan なし・割引なし: 基本料金 + 標準税率", () => {
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      space: baseSpace,
      ratePlans: [],
      reservationSettings: baseSettings,
      coupon: null,
      holidayJudge: noHoliday,
    });
    expect(result.basePrice).toBe(4000);
    expect(result.totalPrice).toBe(4000); // 割引なし
    expect(result.taxRate).toBe(10);
    expect(result.taxAmount).toBe(400);
    expect(result.totalPriceWithTax).toBe(4400);
    expect(result.rateBreakdown.segments).toHaveLength(1);
  });

  test("曜日別 rate plan: 金曜のみ 4000円/h", () => {
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-17T10:00"), // 金
      endDateTime: jst("2026-07-17T12:00"),
      space: baseSpace,
      ratePlans: [
        {
          id: "f",
          name: "金曜料金",
          hourlyPrice: 4000,
          daysOfWeek: ["FRIDAY"],
          holidayMode: "any",
          startTime: null,
          endTime: null,
          effectiveFrom: null,
          effectiveTo: null,
          updatedAt: new Date("2026-01-01"),
        },
      ],
      reservationSettings: baseSettings,
      coupon: null,
      holidayJudge: noHoliday,
    });
    expect(result.basePrice).toBe(8000);
  });

  test("既存の space discount と併用: 10% 割引", () => {
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      space: { ...baseSpace, discountType: "percentage", discountValue: 10 },
      ratePlans: [],
      reservationSettings: baseSettings,
      coupon: null,
      holidayJudge: noHoliday,
    });
    expect(result.basePrice).toBe(4000);
    expect(result.spaceDiscountAmount).toBe(400);
    expect(result.totalPrice).toBe(3600);
  });
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/pricing/calculate-reservation-pricing.test.ts
```

- [ ] **Step 3: `calculatePricing` を basePrice 直接受け取り形に refactor**

`src/shared/lib/pricing/reservation.ts` の `calculateReservationPrice` (行 30 周辺) を、`hourlyPrice` と `hours` を受け取らず `basePrice` を直接受け取る signature に変更:

```ts
export type PriceCalculationParams = {
  basePrice: number;                    // 変更: hourlyPrice × hours から Σ segment.subtotal
  space: { discountType, discountValue, durationDiscountOverride };
  reservationSettings: {...};
  coupon: Coupon | null;
};
```

内部の `basePrice = Math.floor(hourlyPrice * hours)` (現行 line 45) を削除。以下の割引ロジックは basePrice をそのまま使う。

- [ ] **Step 4: `calculateHoursAndBasePrice` を削除**

`src/shared/domain/reservations/payloads.ts:62-70` の関数を削除。呼出元 (3 command + 3 form) から参照を除去。実際の除去は Task 8 で行う (この Task では payloads.ts の関数を削除するだけ、呼出元は Task 8 で置き換え)。

暫定的に `payloads.ts` に「calculateHoursAndBasePrice は削除。calculateReservationPricing を使う」の deprecation comment を残さず、直接削除して呼出元コンパイルエラー化する (fail fast、Task 8 で修正)。

- [ ] **Step 5: `calculateReservationPricing` 実装**

`src/shared/lib/pricing/calculate-reservation-pricing.ts`:

```ts
import {
  resolveRateBreakdown,
  type SpaceRatePlanForResolver,
} from "./rate-plan-resolver";
import {
  calculateReservationPrice,
  type PriceCalculationParams,
} from "./reservation";
import { getTaxRate, calculateTaxAmount } from "./tax";
import type { RateBreakdown } from "./rate-breakdown";
import type {
  Coupon,
  TaxRateType,
  DiscountType,
  DurationDiscountOverride,
} from "@/shared/lib/validations/enums/prisma-types";

export type ReservationPricingInput = {
  startDateTime: Date;
  endDateTime: Date;
  space: {
    hourlyPrice: number;
    discountType: DiscountType;
    discountValue: number | null;
    durationDiscountOverride: DurationDiscountOverride;
    taxRateType: TaxRateType;
  };
  ratePlans: SpaceRatePlanForResolver[];
  reservationSettings: {
    taxStandardRate: number;
    taxReducedRate: number;
    durationDiscountEnabled: boolean;
    durationDiscountRules: unknown;
    discountCombinationMode: "best" | "both";
    showOriginalPrice: boolean;
  };
  coupon: Coupon | null;
  holidayJudge: (jstDateOnly: string) => boolean;
};

export type ReservationPricingResult = {
  rateBreakdown: RateBreakdown;
  basePrice: number;
  spaceDiscountAmount: number;
  durationDiscountAmount: number;
  couponDiscountAmount: number;
  totalPrice: number;
  taxRateType: TaxRateType;
  taxRate: number;
  taxAmount: number;
  totalPriceWithTax: number;
};

export function calculateReservationPricing(
  input: ReservationPricingInput,
): ReservationPricingResult {
  const rateBreakdown = resolveRateBreakdown({
    ratePlans: input.ratePlans,
    spaceHourlyPrice: input.space.hourlyPrice,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    holidayJudge: input.holidayJudge,
  });

  const basePrice = rateBreakdown.totalBasePrice;
  const totalHours = rateBreakdown.totalHours;

  // 既存 calculateReservationPrice を basePrice 直接受け取り形で呼ぶ
  const pricing = calculateReservationPrice({
    basePrice,
    totalHours, // 長時間割引で使う
    space: {
      discountType: input.space.discountType,
      discountValue: input.space.discountValue,
      durationDiscountOverride: input.space.durationDiscountOverride,
    },
    reservationSettings: input.reservationSettings,
    coupon: input.coupon,
  });

  const taxRate = getTaxRate(
    input.space.taxRateType,
    input.reservationSettings,
  );
  const taxAmount = calculateTaxAmount(pricing.totalPrice, taxRate);
  const totalPriceWithTax = pricing.totalPrice + taxAmount;

  return {
    rateBreakdown,
    basePrice,
    spaceDiscountAmount: pricing.spaceDiscountAmount,
    durationDiscountAmount: pricing.durationDiscountAmount,
    couponDiscountAmount: pricing.couponDiscountAmount,
    totalPrice: pricing.totalPrice,
    taxRateType: input.space.taxRateType,
    taxRate,
    taxAmount,
    totalPriceWithTax,
  };
}
```

- [ ] **Step 6: test 実行 → pass 確認**

```bash
bun scripts/run-tests.ts __tests__/unit/lib/pricing/calculate-reservation-pricing.test.ts __tests__/unit/lib/pricing/reservation.test.ts
```

既存 `reservation.test.ts` は signature 変更で fail する。既存テストを新 signature に合わせて修正。

- [ ] **Step 7: commit**

```bash
git add src/shared/lib/pricing/ src/shared/domain/reservations/payloads.ts __tests__/unit/lib/pricing/
git commit -m "refactor(pricing): unify into calculateReservationPricing, remove double multiplication"
```

---

### Task 8: Reservation commands 3 経路 refactor + create 時税書込

**Files:**

- Modify: `src/shared/domain/reservations/public-commands.ts`
- Modify: `src/shared/domain/reservations/admin-commands.ts` (override policy 実装含む)
- Modify: `src/shared/domain/reservations/customer-commands.ts`
- Test: `__tests__/integration/reservations/public-commands.test.ts` (既存拡張)
- Test: `__tests__/integration/reservations/admin-commands.test.ts` (既存拡張)
- Test: `__tests__/integration/reservations/customer-commands.test.ts` (既存拡張)

**Interfaces:**

- Consumes: `calculateReservationPricing` (Task 7), `getSpaceRatePlans` (Task 5), `isJapaneseHoliday` (Task 1)
- Produces: 3 経路すべて `Reservation.create` 時に `basePrice/totalPrice/rateBreakdownJson/taxRateType/taxRate/taxAmount/totalPriceWithTax/priceOverriddenBy` を必ず書き込む

- [ ] **Step 1: failing integration test を追加**

各 3 経路の既存 test file に以下を追加 (代表 3 ケース × 3 経路):

```ts
describe("rate plan 統合", () => {
  test("rate plan なしで従来通り予約作成できる (regression)", async () => {
    // 既存 test の期待値に加えて:
    // reservation.rateBreakdownJson.segments[0].hourlyPrice === space.hourlyPrice
    // reservation.taxRate は Settings.taxStandardRate (or reduced)
    // reservation.taxAmount === Math.round(totalPrice * taxRate / 100)
    // reservation.totalPriceWithTax === totalPrice + taxAmount
  });

  test("曜日別 rate plan が適用される", async () => {
    // 事前に createSpaceRatePlan で金曜料金を追加
    // 金曜の予約を作成
    // rateBreakdownJson.segments[0].ratePlanId が rate plan の id
    // basePrice が高い方の rate で計算される
  });

  test("rate plan 変更後も既存予約の rateBreakdownJson が snapshot として不変", async () => {
    // 予約作成
    // rate plan を updateSpaceRatePlan
    // 予約を再取得
    // rateBreakdownJson.segments が変わっていない
  });
});
```

admin-commands.ts test には override 追加:

```ts
test("admin override: totalPrice のみ上書き、rateBreakdownJson.segments は保持", async () => {
  const reservation = await createAdminReservationCommand({
    ...baseInput,
    totalPrice: 10000, // override
    priceOverriddenBy: "admin-user-id",
  });
  expect(reservation.totalPrice.toNumber()).toBe(10000);
  expect(reservation.rateBreakdownJson).toHaveProperty("segments");
  // 税は override 後の totalPrice から派生
  expect(reservation.taxAmount.toNumber()).toBe(1000); // 10000 * 10% = 1000
});
```

- [ ] **Step 2: test 実行 → fail 確認**

```bash
bun run test:integration __tests__/integration/reservations/
```

- [ ] **Step 3: public-commands.ts 変更**

`src/shared/domain/reservations/public-commands.ts` の `createPublicReservationCommand`:

- Space fetch (line 78-81 周辺) の select に `hourlyPrice, discountType, discountValue, durationDiscountOverride, taxRateType, id` を維持。
- `getSpaceRatePlans(spaceId)` を advisory lock の前に呼ぶ (rate plan は read-only なので lock 不要)。
- `calculateHoursAndBasePrice` 呼び出しを削除、代わりに `calculateReservationPricing({ startDateTime, endDateTime, space, ratePlans, reservationSettings, coupon, holidayJudge: isJapaneseHoliday })` を呼ぶ。
- `tx.reservation.create` の data に `basePrice/totalPrice/rateBreakdownJson/taxRateType/taxRate/taxAmount/totalPriceWithTax` を全て含める:

```ts
data: {
  // ... 既存 field
  basePrice: pricing.basePrice,
  totalPrice: pricing.totalPrice,
  rateBreakdownJson: pricing.rateBreakdown as Prisma.InputJsonValue,
  taxRateType: pricing.taxRateType,
  taxRate: pricing.taxRate,
  taxAmount: pricing.taxAmount,
  totalPriceWithTax: pricing.totalPriceWithTax,
  spaceDiscountAmount: pricing.spaceDiscountAmount,
  durationDiscountAmount: pricing.durationDiscountAmount,
  couponDiscountAmount: pricing.couponDiscountAmount,
}
```

- [ ] **Step 4: admin-commands.ts 変更 + override policy 実装**

`createAdminReservationCommand`:

- 上と同じく `getSpaceRatePlans` + `calculateReservationPricing` に置換。
- override 分岐: `input.totalPrice != null` の場合、`pricing.totalPrice` を override 値で上書きし、taxAmount/totalPriceWithTax を派生再計算:
  ```ts
  const finalTotalPrice = input.totalPrice ?? pricing.totalPrice;
  const finalTaxAmount =
    input.totalPrice != null
      ? Math.round((input.totalPrice * pricing.taxRate) / 100)
      : pricing.taxAmount;
  const finalTotalPriceWithTax =
    input.totalPrice != null
      ? input.totalPrice + finalTaxAmount
      : pricing.totalPriceWithTax;
  ```
- `priceOverriddenBy` を admin user id で書き込む (input に admin user id が渡っている前提、なければ input schema 拡張)。

`updateAdminReservationCommand` も同様に refactor (税計算の Math.floor / rate 単位不一致 bug も併せて修正: `Math.round(totalPrice * taxRate / 100)` に統一)。

- [ ] **Step 5: customer-commands.ts 変更**

`updateCustomerReservation` (line 285-319 周辺) を同様に refactor。customer 側は override なし。既存の `Math.floor(priceResult.totalPrice * taxRate)` bug (税率が % なのに / 100 忘れ) も併せて修正。

- [ ] **Step 6: test 実行 → pass 確認**

```bash
bun run test:integration __tests__/integration/reservations/
```

- [ ] **Step 7: commit**

```bash
git add src/shared/domain/reservations/ __tests__/integration/reservations/
git commit -m "fix(reservation): wire rate plan into 3 command paths, snapshot tax fields at create"
```

---

### Task 9: Legacy fallback (receipts/issue.ts)

**Files:**

- Modify: `src/shared/domain/reservations/receipts/issue.ts`

**Interfaces:**

- Consumes: `isLegacyRateBreakdown` from Task 2

- [ ] **Step 1: 既存の fallback 経路を確認**

```bash
grep -n "totalPriceWithTax\|taxAmount" src/shared/domain/reservations/receipts/issue.ts
```

- [ ] **Step 2: legacy 検知の分岐を追加**

`issue.ts` の該当箇所で、`reservation.rateBreakdownJson` が legacy なら現行 fallback (`totalPriceWithTax ?? totalPrice` 等) を維持、legacy でなければ snapshot の値を厳密に使う:

```ts
import { isLegacyRateBreakdown } from "@/shared/lib/pricing/rate-breakdown";

const isLegacy = isLegacyRateBreakdown(reservation.rateBreakdownJson);
const displayTotalWithTax = isLegacy
  ? (reservation.totalPriceWithTax ?? reservation.totalPrice ?? 0)
  : reservation.totalPriceWithTax;
```

- [ ] **Step 3: unit test で legacy と modern 両方 pass することを確認**

既存 `receipts` 系 test が該当 pattern を持つか grep。持たない場合は追加。

```bash
bun scripts/run-tests.ts __tests__/unit/receipts/ 2>/dev/null || bun scripts/run-tests.ts src/shared/domain/reservations/receipts/
```

- [ ] **Step 4: commit**

```bash
git add src/shared/domain/reservations/receipts/
git commit -m "chore(receipts): detect legacy rateBreakdownJson to keep fallback path"
```

---

### Task 10: Admin Zod schema + Server Action

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space-rate-plan.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/space-rate-plan.ts`

**Interfaces:**

- Consumes: `createSpaceRatePlan/updateSpaceRatePlan/deleteSpaceRatePlan` (Task 6)
- Produces: `spaceRatePlanFormSchema` (Zod), `createSpaceRatePlanAction/updateSpaceRatePlanAction/deleteSpaceRatePlanAction` (server actions)

- [ ] **Step 1: Zod schema**

```ts
import { z } from "zod";
import {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";

const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const endTimePattern = /^([01][0-9]|2[0-3]|24):[0-5][0-9]$/;

export const spaceRatePlanFormSchema = z
  .object({
    spaceId: z.string().min(1),
    name: z.string().min(1).max(100),
    hourlyPrice: z.coerce.number().int().min(0).max(1_000_000),
    daysOfWeek: z
      .array(z.enum(Object.values(DayOfWeek) as [string, ...string[]]))
      .default([]),
    holidayMode: z
      .enum(Object.values(HolidayMode) as [string, ...string[]])
      .default("any"),
    startTime: z.string().regex(timePattern).nullable().default(null),
    endTime: z.string().regex(endTimePattern).nullable().default(null),
    effectiveFrom: z.coerce.date().nullable().default(null),
    effectiveTo: z.coerce.date().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime) {
      // startTime < endTime を要求 (cross-midnight は 2 plan 登録で対応、spec 参照)
      if (data.startTime >= data.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endTime"],
          message: "終了時刻は開始時刻より後にしてください",
        });
      }
    }
    if (
      data.effectiveFrom &&
      data.effectiveTo &&
      data.effectiveFrom > data.effectiveTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "有効終了日は有効開始日以降にしてください",
      });
    }
  });
```

- [ ] **Step 2: Server Action**

`createSpaceRatePlanAction / updateSpaceRatePlanAction / deleteSpaceRatePlanAction` を既存の admin action pattern (`executeConformMutation` + `getAuditActor` + admin RBAC) に沿って実装。既存の `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` を参照して同一パターンで書く。

- [ ] **Step 3: validate + type-check**

```bash
bun run validate
```

- [ ] **Step 4: commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/validations/space-rate-plan.ts src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/space-rate-plan.ts
git commit -m "feat(admin): add SpaceRatePlan Zod schema and CRUD server actions"
```

---

### Task 11: Admin UI: SpaceRatePlanList + SpaceRatePlanEditModal

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceRatePlanList.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceRatePlanEditModal.tsx`

**Interfaces:**

- Consumes: server actions from Task 10、type from Task 6
- Produces: React components that mount into SpaceEditForm pricing tab (Task 12)

- [ ] **Step 1: SpaceRatePlanList component**

Props: `{ spaceId: string; plans: SpaceRatePlanForResolver[] }`
表示: table (name / 曜日 / 時間帯 / 期間 / 料金 / 編集 / 削除)、下に「+ 新規プラン追加」ボタン。edit/新規で modal を開く。

既存の admin table pattern (例: `src/app/(admin)/admin/(dashboard)/spaces/_components` 配下の他 list component) と揃える。

- [ ] **Step 2: SpaceRatePlanEditModal component**

Props: `{ spaceId: string; plan?: SpaceRatePlanForResolver; onClose: () => void }`
conform + `spaceRatePlanFormSchema` を使用。field: name / hourlyPrice / daysOfWeek (checkbox group) / holidayMode (radio) / startTime / endTime (time input) / effectiveFrom / effectiveTo (date input)。
submit で create or update action を呼ぶ。既存の admin modal pattern (Dialog primitive) を踏襲。

- [ ] **Step 3: 単体で mount させて動作確認**

もし storybook や dev route で単体 mount できる仕組みがあるなら確認。無ければ Task 12 で SpaceEditForm に組み込んだ後 E2E で検証。

- [ ] **Step 4: type-check**

```bash
bun run validate
```

- [ ] **Step 5: commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/spaces/_components/SpaceRatePlan*.tsx
git commit -m "feat(admin): add SpaceRatePlanList and edit modal"
```

---

### Task 12: SpaceEditForm 変更 (dailyPrice 削除 + rate plan section)

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts` (dailyPrice 削除)
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/[id]/edit/page.tsx` (rate plans を SSR で fetch して渡す)
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` (dailyPrice 参照除去、必要なら)

- [ ] **Step 1: `spaceFormSchema` から `dailyPrice` 削除**

`_shared/lib/validations/space.ts:187-200` の `dailyPrice` field を削除、`defaultSpaceFormValues` (line 286 周辺) からも除去。

- [ ] **Step 2: `SpaceEditForm.tsx` から `dailyPrice` UI と hidden input 削除**

`SpaceEditForm.tsx:430` 周辺の `dailyPrice` hidden input、`:776-800` 周辺の入力 UI を削除。

- [ ] **Step 3: pricing タブに rate plan section 追加**

`pricing` タブ (line 738-1053) の末尾に `<Card>` を追加し、`<SpaceRatePlanList spaceId={space?.id ?? ""} plans={ratePlans} />` をレンダー。

**注意**: create mode では space.id がまだ無いので rate plan section は edit mode のみ表示 (spec 参照)。create mode は無効化 tooltip 表示。

- [ ] **Step 4: edit/page.tsx で `getSpaceRatePlans` を呼ぶ**

`spaces/[id]/edit/page.tsx` の loader で `getSpaceRatePlans(space.id)` を呼び、SpaceEditForm に渡す。

- [ ] **Step 5: validate**

```bash
bun run validate
```

- [ ] **Step 6: commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/spaces/ src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/validations/space.ts
git commit -m "feat(admin): remove dailyPrice field, add rate plan section to SpaceEditForm"
```

---

### Task 13: 予約 form プレビュー統合

**Files:**

- Modify: `src/app/(public)/_shared/actions/reservation.ts` (料金プレビュー endpoint、既存があれば)
- Modify: `src/app/(public)/_shared/components/reservation-form.tsx` (呼び出し部分)
- Modify: `src/app/(admin)/.../ReservationForm.tsx` および `ReservationEditForm.tsx`

- [ ] **Step 1: プレビュー endpoint 特定**

```bash
grep -rn "calculateReservationPrice\|calculateHoursAndBasePrice" src/app/ | head -10
```

該当箇所を `calculateReservationPricing` (Task 7) に置換。rate plan は `getSpaceRatePlans(spaceId)` で取得。

- [ ] **Step 2: form 側の呼び出し引数を新 signature に合わせる**

client 側 (`reservation-form.tsx` 等) は Server Action 経由で呼ぶだけなので、Server Action の contract 変更を反映するだけで済むはず。もし client 側で hourlyPrice を直接持って計算プレビューしているならその箇所を削除 (server SSoT に一本化)。

- [ ] **Step 3: 手動確認**

```bash
bun run dev
```

localhost:3000 で予約 form を開いて時間帯変更 → プレビューが正しく更新されることを確認。

- [ ] **Step 4: validate + integration test**

```bash
bun run validate
bun run test:integration __tests__/integration/reservations/
```

- [ ] **Step 5: commit**

```bash
git add src/app/
git commit -m "feat(reservation-form): route preview through calculateReservationPricing"
```

---

### Task 14: Drift gate (architecture-boundaries)

**Files:**

- Modify: `__tests__/unit/architecture-boundaries.test.ts`

- [ ] **Step 1: 既存 drift gate 確認**

```bash
grep -n "SPACES\|CACHE_TAGS" __tests__/unit/architecture-boundaries.test.ts | head -10
```

- [ ] **Step 2: SPACE_RATE_PLANS の producer/CDN mapping check を追加**

既存の SPACES 等の check pattern を模倣。cache tag が `CACHE_TAGS.SPACE_RATE_PLANS` として定義されており、その producer (`getSpaceRatePlans` に `cacheTag()` 呼び出しがある) と CDN mapping (`NEXTJS_TAG_TO_CDN_TAG` に `space:*:rate-plans`) が揃っていることを確認する。

- [ ] **Step 3: 実行**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

- [ ] **Step 4: commit**

```bash
git add __tests__/unit/architecture-boundaries.test.ts
git commit -m "test(arch): add SPACE_RATE_PLANS drift gate"
```

---

### Task 15: Seed + E2E fixture

**Files:**

- Modify: `prisma/seed.ts` (dev seed、SpaceRatePlan の例を追加)
- Modify: `e2e/fixtures/*` (該当 fixture ファイルに SpaceRatePlan seed 追加)

- [ ] **Step 1: seed に SpaceRatePlan を追加**

`prisma/seed.ts` の dev seed 部分に、Space ごとに「金曜料金」「祝日料金」等の rate plan を 1-2 個作る:

```ts
await prisma.spaceRatePlan.create({
  data: {
    spaceId: space.id,
    name: "週末料金",
    hourlyPrice: space.hourlyPrice.toNumber() * 1.3,
    daysOfWeek: ["FRIDAY", "SATURDAY", "SUNDAY"],
    holidayMode: "any",
    startTime: null,
    endTime: null,
    effectiveFrom: null,
    effectiveTo: null,
  },
});
```

**重要**: `prisma/seed.ts` の dev/prod 分離ポリシー ([memory: project_seed-dev-prod-split-2026-06-13.md](../../memory/...)) を守る。本番 seed には rate plan の例を入れない (fake data cleanup ポリシー)。

- [ ] **Step 2: E2E fixture 更新**

`e2e/fixtures/*` に rate plan seed を含む fixture を追加または既存 fixture を拡張。

- [ ] **Step 3: seed 実行確認**

```bash
bun run db:seed
```

- [ ] **Step 4: commit**

```bash
git add prisma/seed.ts e2e/fixtures/
git commit -m "chore(seed): add SpaceRatePlan example seeds (dev only)"
```

---

### Task 16: E2E: rate-plan-preview + admin-crud

**Files:**

- Create: `e2e/reservation/rate-plan-preview.spec.ts` (public smoke)
- Create: `e2e/admin/space-rate-plan-crud.spec.ts` (authenticated smoke)

- [ ] **Step 1: public smoke spec**

`e2e/reservation/rate-plan-preview.spec.ts`:

- Space 詳細ページを開く
- 時間帯を「金曜 19:00-21:00」に設定
- 料金プレビューに「週末料金」が反映されていることを DOM 検証

**必ず**: `.claude/skills/e2e-authoring` を参照して project (smoke / public / a11y / authenticated / visual) の選択を確認。

- [ ] **Step 2: admin CRUD spec**

`e2e/admin/space-rate-plan-crud.spec.ts`:

- storageState で admin ログイン
- Space 編集画面 → pricing タブ
- 「+ 新規プラン追加」→ modal → 入力 → save
- 一覧に反映されることを確認
- 編集 → 保存
- 削除 → 確認 → 一覧から消える

- [ ] **Step 3: 実行**

```bash
bunx playwright test e2e/reservation/rate-plan-preview.spec.ts e2e/admin/space-rate-plan-crud.spec.ts --project=chromium-smoke
```

- [ ] **Step 4: commit**

```bash
git add e2e/reservation/rate-plan-preview.spec.ts e2e/admin/space-rate-plan-crud.spec.ts
git commit -m "test(e2e): add smoke specs for rate plan preview and admin CRUD"
```

---

### Task 17: 最終 validate + build + full test

- [ ] **Step 1: 全 unit テスト**

```bash
bun run test:unit
```

Expected: 全 pass

- [ ] **Step 2: 全 integration テスト**

```bash
bun run test:integration
```

Expected: 全 pass

- [ ] **Step 3: validate**

```bash
bun run validate
```

Expected: exit 0

- [ ] **Step 4: build**

```bash
bun run build
```

Expected: exit 0 (実 env 検証あり、失敗時は `bun run build:skip-env` で placeholder 検証)

- [ ] **Step 5: smoke E2E**

```bash
bunx playwright test --project=chromium-smoke
```

Expected: 全 pass

- [ ] **Step 6: 何も commit する変更がないことを確認**

```bash
git status --short
```

- [ ] **Step 7: PR 準備**

CLAUDE.md 自動完遂ポリシーに従い:

- push → PR 作成 → auto-merge 予約
- PR body に spec ・ deep research summary への link を含める

```bash
git push -u origin feat/space-rate-plan
gh pr create --base main --title "feat(pricing): SpaceRatePlan (曜日別/時間帯別/特定期間/祝日料金) + Reservation snapshot" --body "$(cat <<'EOF'
## Summary
- 業界標準の rate rule システムを新設 (Spacemarket 準拠の "特別営業" 3 軸 + last-updated-wins 優先度)
- 既存 3 件の bug を同時修正 (税 create 未書込 / 二重計算 / 単価snapshot欠如)
- 未使用 `Space.dailyPrice` カラム削除
- 破壊的 migration (計画ダウンタイム自動発動、バックフィル付き)

## Design
- Spec: `docs/superpowers/specs/2026-07-14-space-rate-plan-design.md`
- Plan: `docs/superpowers/plans/2026-07-14-space-rate-plan.md`
- Deep research: 107 subagent, 22 primary source verified findings

## Test plan
- [x] unit: rate plan resolver / holiday / rate breakdown schema / pricing 統合関数
- [x] integration: 3 reservation command 経路 + rate plan CRUD + snapshot 独立性
- [x] E2E smoke: rate plan preview (public) + admin CRUD (authenticated)
- [x] drift gate: SPACE_RATE_PLANS producer + CDN mapping

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review

**Spec coverage:**

- ✅ Data model (SpaceRatePlan / DayOfWeek / HolidayMode / Reservation NOT NULL 化 / dailyPrice DROP) → Task 3
- ✅ RateBreakdown Zod schema → Task 2
- ✅ Rate 解決 pure function (segment 分割 / 優先度 / 祝日) → Task 4
- ✅ 祝日判定 → Task 1
- ✅ 予約計算経路 refactor + 二重計算解消 → Task 7
- ✅ 予約 create 経路の税書込 → Task 8
- ✅ Admin UI (CRUD + SpaceEditForm 統合) → Task 10-12
- ✅ Preview endpoint 統合 → Task 13
- ✅ Cache 戦略 (SPACE_RATE_PLANS tag + revalidate) → Task 5
- ✅ Legacy row fallback (receipts/issue) → Task 9
- ✅ Drift gate → Task 14
- ✅ Seed / E2E fixture → Task 15
- ✅ E2E specs → Task 16

**Placeholder scan:** 全 task で code snippet を提供済み、"TBD" / "TODO" / "implement later" なし。

**Type consistency:**

- `SpaceRatePlanForResolver` は Task 4 で定義、Task 5・6・7・8 で consumed。field 名一致。
- `RateBreakdown` は Task 2 で定義、Task 4・7・8 で consumed。
- `calculateReservationPricing` の signature は Task 7 で定義、Task 8・13 で consumed。

**未解決の実装リスク:**

- Task 4 の JST↔UTC 変換の細部 (時計壁時計時刻の Date 表現) は既存 `src/shared/lib/date-format.ts` の pattern を実装時に必ず確認する。既存前例と乖離すると DST-free でも境界日で bug が入る。
- Task 3 の Prisma `@@check` サポートは Prisma 7 で実験的な可能性あり (要確認、無理なら migration.sql 手書き CHECK)。
- Task 5 の CDN tag mapping で wildcard `space:*:rate-plans` が既存 pattern と適合するかは実装時に既存 `NEXTJS_TAG_TO_CDN_TAG` を full read して判断。
- Task 15 の seed で prod/dev 分離は memory の該当項目に従う。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-14-space-rate-plan.md`.**

各 task は独立して verify 可能で、TDD 順序 (test → fail → impl → pass → commit) を全 task で徹底する。合計 17 task、想定 PR 規模 1000-1500 行、breaking migration 込み。

execution mode をユーザーに確認する:

1. **Subagent-Driven (推奨)** — fresh subagent per task + 2-stage review。品質最高、token 消費大。
2. **Inline Execution** — このセッションで連続実行。効率最高、context 汚染に注意。
