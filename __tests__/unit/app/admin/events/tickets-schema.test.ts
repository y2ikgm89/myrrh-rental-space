import { describe, expect, test } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { eventFormSchema } from "@/app/(admin)/admin/(dashboard)/events/_components/event-form-schema";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

/**
 * TicketsField を conform native field.array 化 (Option (a)) した後の schema 挙動を pin。
 *
 * - `tickets[N].<field>` 形式の FormData 入力が、parseWithZod で
 *   ドメイン期待値 (number / boolean / null 正規化済み) に coerce されること
 * - 空欄の nullable フィールド (capacity / description) が null に落ちること
 * - unchecked Switch (FormData 未送信) が isAvailable: false に落ちること
 * - 複数区分の capacity 必須 refine が nested path `tickets[N].capacity` を発火すること
 * - array 全体 error (min(1) 等) が top-level `tickets` key で届くこと
 *
 * 目的: conform / Zod v4 の path フォーマット・coercion 挙動が変わったら
 * silent regression にならないよう固定する。UI (TicketsField) は本テストが担保する
 * schema 契約に依存して per-input inline error を描画する。
 */
describe("event-form-schema tickets: native FormData round-trip", () => {
  function buildFormData(entries: Record<string, string>): FormData {
    const fd = new FormData();
    fd.set("title", "Test event");
    fd.set("slug", "test-event");
    fd.set("categoryId", "33333333-3333-4333-8333-333333333333");
    fd.set("descriptionJson", EMPTY_LEXICAL_EDITOR_STATE_JSON);
    fd.set("scheduleMode", "SINGLE_OCCURRENCE");
    fd.set("status", "DRAFT");
    fd.set("registrationOpen", "");
    fd.set(
      "slots",
      JSON.stringify([
        {
          startAt: "2026-08-01T10:00",
          endAt: "2026-08-01T12:00",
          capacity: 10,
        },
      ]),
    );
    fd.set("format", "OFFLINE");
    fd.set("meetingProvider", "MANUAL");
    for (const [key, value] of Object.entries(entries)) {
      fd.set(key, value);
    }
    return fd;
  }

  test("single valid ticket: coerced to typed values", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "一般",
        "tickets[0].description": "",
        "tickets[0].price": "5000",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.value.tickets).toEqual([
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ]);
  });

  test("existing ticket id round-trips as string on the row", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].id": "cln1234567890abcdef",
        "tickets[0].name": "一般",
        "tickets[0].description": "",
        "tickets[0].price": "5000",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.value.tickets[0]?.id).toBe("cln1234567890abcdef");
  });

  test("Switch unchecked (FormData not sent) → isAvailable: false via switchBoolean", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "早割",
        "tickets[0].description": "",
        "tickets[0].price": "3000",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        // isAvailable キー未送信 (Radix Switch unchecked 相当)
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.value.tickets[0]?.isAvailable).toBe(false);
  });

  test("multi-ticket capacity required refine fires at tickets[N].capacity", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "一般",
        "tickets[0].description": "",
        "tickets[0].price": "5000",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
        "tickets[1].name": "学生",
        "tickets[1].description": "",
        "tickets[1].price": "3000",
        "tickets[1].capacity": "",
        "tickets[1].unitSize": "1",
        "tickets[1].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error?.["tickets[0].capacity"]).toEqual([
      "区分が複数のときは受付人数を入力してください",
    ]);
    expect(result.error?.["tickets[1].capacity"]).toEqual([
      "区分が複数のときは受付人数を入力してください",
    ]);
  });

  test("required name (empty) yields error at tickets[N].name", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "",
        "tickets[0].description": "",
        "tickets[0].price": "5000",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    // conform coerces "" → undefined; z.string({error}) の error オプションが
    // undefined→string 検査の失敗にも我々のカスタムメッセージを適用する。
    expect(result.error?.["tickets[0].name"]).toEqual(["チケット名は必須です"]);
  });

  test("negative price yields error at tickets[N].price with custom message", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "一般",
        "tickets[0].description": "",
        "tickets[0].price": "-100",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error?.["tickets[0].price"]).toEqual(["料金は0以上です"]);
  });

  test("empty ticket set → top-level 'tickets' array error (min(1))", () => {
    // 全ての tickets[N].* を送らないと `tickets` 自体が undefined → array wrap で []
    const result = parseWithZod(buildFormData({}), {
      schema: eventFormSchema,
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error?.["tickets"]).toEqual([
      "区分を少なくとも1つ登録してください",
    ]);
  });

  test("capacity number stays typed as number, not string", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "一般",
        "tickets[0].description": "",
        "tickets[0].price": "5000",
        "tickets[0].capacity": "20",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.value.tickets[0]?.capacity).toBe(20);
    expect(typeof result.value.tickets[0]?.capacity).toBe("number");
  });

  test("description empty string normalizes to null", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "一般",
        "tickets[0].description": "",
        "tickets[0].price": "5000",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.value.tickets[0]?.description).toBeNull();
  });

  test("description non-empty string stays as provided", () => {
    const result = parseWithZod(
      buildFormData({
        "tickets[0].name": "学生",
        "tickets[0].description": "高校生以上の学生証提示",
        "tickets[0].price": "3000",
        "tickets[0].capacity": "",
        "tickets[0].unitSize": "1",
        "tickets[0].isAvailable": "on",
      }),
      { schema: eventFormSchema },
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.value.tickets[0]?.description).toBe("高校生以上の学生証提示");
  });
});
