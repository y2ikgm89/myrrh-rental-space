/**
 * 回帰テスト: `createRecurringReservationFormSchema` (Phase B.2.1 Task 20)。
 *
 * conform の `parseWithZod` は空入力を `undefined` に変換する。
 * recurring form schema には `.default(0)` / `.default([])` / `.default("")` を
 * 通じて空入力を許容する defaults が入っているが、superRefine で
 * WEEKLY→byday 1件以上 / endMode=count→count>=1 / endMode=until→until 必須 /
 * count<=maxRecurrenceInstances 等の cross-field 制約を強制する。
 *
 * 本テストは実体 schema を import し、FormData 経由で parseWithZod を回して
 * 空入力の吸収 + cross-field 契約を pin する (schema を書き換えて superRefine を
 * 壊すと本テストが落ちる)。
 */
import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { createRecurringReservationFormSchema } from "@/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema";

const CUSTOMER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPACE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DATE = "2027-05-04"; // 火曜
const START = "10:00";
const END = "12:00";

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) {
      for (const item of v) fd.append(k, item);
    } else {
      fd.set(k, v);
    }
  }
  return fd;
}

const schema = createRecurringReservationFormSchema({
  maxRecurrenceInstances: 12,
});

describe("createRecurringReservationFormSchema: conform 経由", () => {
  test("最小限の valid input (WEEKLY BYDAY=TU COUNT=4) は success", () => {
    const fd = form({
      customerId: CUSTOMER_ID,
      spaceId: SPACE_ID,
      date: DATE,
      startTime: START,
      endTime: END,
      freq: "WEEKLY",
      interval: "1",
      byday: "TU",
      endMode: "count",
      count: "4",
      until: "",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.value.freq).toBe("WEEKLY");
      expect(result.value.byday).toEqual(["TU"]);
      expect(result.value.count).toBe(4);
      expect(result.value.endMode).toBe("count");
    }
  });

  test("DAILY interval=2 UNTIL=2027-09-01 は success (byday 不要)", () => {
    const fd = form({
      customerId: CUSTOMER_ID,
      spaceId: SPACE_ID,
      date: DATE,
      startTime: START,
      endTime: END,
      freq: "DAILY",
      interval: "2",
      endMode: "until",
      count: "0",
      until: "2027-09-01",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.value.freq).toBe("DAILY");
      expect(result.value.interval).toBe(2);
      expect(result.value.until).toBe("2027-09-01");
    }
  });

  test("customerId 空は error (uuid 必須)", () => {
    const fd = form({
      customerId: "",
      spaceId: SPACE_ID,
      date: DATE,
      startTime: START,
      endTime: END,
      freq: "WEEKLY",
      interval: "1",
      byday: "TU",
      endMode: "count",
      count: "4",
      until: "",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("error");
  });

  test("WEEKLY で byday 未選択は error", () => {
    const fd = form({
      customerId: CUSTOMER_ID,
      spaceId: SPACE_ID,
      date: DATE,
      startTime: START,
      endTime: END,
      freq: "WEEKLY",
      interval: "1",
      // byday 未送信 → default([]) で空配列
      endMode: "count",
      count: "4",
      until: "",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("error");
  });

  test("endMode=count で count=0 は error (最低 1 回)", () => {
    const fd = form({
      customerId: CUSTOMER_ID,
      spaceId: SPACE_ID,
      date: DATE,
      startTime: START,
      endTime: END,
      freq: "WEEKLY",
      interval: "1",
      byday: "TU",
      endMode: "count",
      count: "0",
      until: "",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("error");
  });

  test("endMode=count で count>maxRecurrenceInstances は error", () => {
    const fd = form({
      customerId: CUSTOMER_ID,
      spaceId: SPACE_ID,
      date: DATE,
      startTime: START,
      endTime: END,
      freq: "WEEKLY",
      interval: "1",
      byday: "TU",
      endMode: "count",
      count: "13", // maxRecurrenceInstances=12 を超過
      until: "",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("error");
  });

  test("endMode=until で until 空は error", () => {
    const fd = form({
      customerId: CUSTOMER_ID,
      spaceId: SPACE_ID,
      date: DATE,
      startTime: START,
      endTime: END,
      freq: "DAILY",
      interval: "1",
      endMode: "until",
      count: "0",
      until: "",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("error");
  });

  test("endTime <= startTime は error (refineTimeRange 継承)", () => {
    const fd = form({
      customerId: CUSTOMER_ID,
      spaceId: SPACE_ID,
      date: DATE,
      startTime: "12:00",
      endTime: "11:00",
      freq: "WEEKLY",
      interval: "1",
      byday: "TU",
      endMode: "count",
      count: "4",
      until: "",
    });
    const result = parseWithZod(fd, { schema });
    expect(result.status).toBe("error");
  });
});
