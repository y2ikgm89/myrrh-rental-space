/**
 * `createRecurringReservationFormSchema` の Zod schema unit test (Phase B.2 task 20).
 *
 * 検証観点:
 *   - freq / interval / byday / endMode (count | until) の必須と型
 *   - COUNT 選択時: count 必須 + 1〜maxRecurrenceInstances 上限 (呼出側が上限渡す)
 *   - UNTIL 選択時: until (YYYY-MM-DD) 必須
 *   - WEEKLY 時: byday 少なくとも 1 要素
 *   - DAILY / MONTHLY: byday は無視 (空配列で可)
 *
 * conform + FormData での実測検証は `series-form-empty-optional.test.ts` が担当する
 * 予定だが、Phase B.2 内では純 object 入力の refine 論理のみ本 test で pin する
 * (server action Task 21 の Zod parse が同じ shape を受け取るため)。
 */

import { describe, expect, test } from "bun:test";

import {
  createRecurringReservationFormSchema,
  parseRecurringReservationForm,
} from "@/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema";

const VALID_BASE = {
  customerId: "11111111-1111-4111-8111-111111111111",
  spaceId: "22222222-2222-4222-8222-222222222222",
  date: "2027-05-04",
  startTime: "10:00",
  endTime: "12:00",
  freq: "WEEKLY" as const,
  interval: 1,
  byday: ["TU"] as const,
  endMode: "count" as const,
  count: 10,
  until: "",
};

describe("createRecurringReservationFormSchema — Phase B.2 task 20", () => {
  test("WEEKLY + BYDAY + COUNT で valid", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });

  test("WEEKLY で byday 空配列は error", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({ ...VALID_BASE, byday: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".").includes("byday")),
      ).toBe(true);
    }
  });

  test("DAILY で byday 空配列は OK (WEEKLY 以外は byday 不要)", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({
      ...VALID_BASE,
      freq: "DAILY",
      byday: [],
    });
    expect(result.success).toBe(true);
  });

  test("MONTHLY で byday 空配列は OK", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({
      ...VALID_BASE,
      freq: "MONTHLY",
      byday: [],
    });
    expect(result.success).toBe(true);
  });

  test("COUNT 選択で count > maxRecurrenceInstances は error", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({ ...VALID_BASE, count: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".").includes("count")),
      ).toBe(true);
    }
  });

  test("COUNT 選択で count 0 は error", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({ ...VALID_BASE, count: 0 });
    expect(result.success).toBe(false);
  });

  test("UNTIL 選択で until 空文字は error", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({
      ...VALID_BASE,
      endMode: "until",
      until: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".").includes("until")),
      ).toBe(true);
    }
  });

  test("UNTIL 選択で until 正しい形式は OK", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({
      ...VALID_BASE,
      endMode: "until",
      count: 0,
      until: "2027-09-01",
    });
    expect(result.success).toBe(true);
  });

  test("endTime <= startTime は error (単発と同じ time refine を継承)", () => {
    const schema = createRecurringReservationFormSchema({
      maxRecurrenceInstances: 26,
    });
    const result = schema.safeParse({
      ...VALID_BASE,
      startTime: "12:00",
      endTime: "11:00",
    });
    expect(result.success).toBe(false);
  });

  test("parseRecurringReservationForm helper が form data を parse できる", () => {
    const result = parseRecurringReservationForm(VALID_BASE, {
      maxRecurrenceInstances: 26,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.freq).toBe("WEEKLY");
      expect(result.data.byday).toEqual(["TU"]);
      expect(result.data.count).toBe(10);
    }
  });
});
