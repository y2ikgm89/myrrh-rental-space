import { describe, expect, test } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  countTicketFieldErrorGroups,
  groupTicketFieldErrors,
  selectTicketsArrayErrors,
  type FieldErrorMap,
} from "@/app/(admin)/admin/(dashboard)/events/_components/ticket-errors";
import { eventFormSchema } from "@/app/(admin)/admin/(dashboard)/events/_components/event-form-schema";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

/**
 * Round-3 admin audit Finding #11 の回帰テスト。
 *
 * TicketsField の per-row per-field error 配線が壊れないことを保証する。
 * - pure helper: key 命名を仮定した振り分けロジックの正しさ
 * - integration: `parseWithZod(eventFormSchema, ...)` が実際に
 *   `tickets[N].<field>` 命名でエラーを吐くことを固定する
 *   （conform / Zod の path フォーマット変更で silently 壊れないよう固定する）
 */

describe("ticket-errors: groupTicketFieldErrors", () => {
  test("nested field errors are grouped by row index", () => {
    const input: FieldErrorMap = {
      "tickets[0].name": ["チケット名は必須です"],
      "tickets[0].capacity": ["区分が複数のときは枠数を入力してください"],
      "tickets[1].price": ["料金は0以上です"],
    };
    const result = groupTicketFieldErrors(input);
    expect(result.size).toBe(2);
    expect(result.get(0)).toEqual({
      name: ["チケット名は必須です"],
      capacity: ["区分が複数のときは枠数を入力してください"],
    });
    expect(result.get(1)).toEqual({
      price: ["料金は0以上です"],
    });
  });

  test("row-level issue (no field suffix) goes to __row__ bucket", () => {
    const input: FieldErrorMap = {
      "tickets[3]": ["区分エントリが不正です"],
    };
    const result = groupTicketFieldErrors(input);
    expect(result.get(3)).toEqual({
      __row__: ["区分エントリが不正です"],
    });
  });

  test("top-level 'tickets' key is NOT included (goes to selectTicketsArrayErrors)", () => {
    const input: FieldErrorMap = {
      tickets: ["区分を少なくとも1つ登録してください"],
    };
    const result = groupTicketFieldErrors(input);
    expect(result.size).toBe(0);
  });

  test("null and empty-array entries are filtered out", () => {
    const input: FieldErrorMap = {
      "tickets[0].name": null,
      "tickets[0].price": [],
      "tickets[1].name": ["ok"],
    };
    const result = groupTicketFieldErrors(input);
    expect(result.get(0)).toBeUndefined();
    expect(result.get(1)).toEqual({ name: ["ok"] });
  });

  test("unrelated keys are ignored", () => {
    const input: FieldErrorMap = {
      title: ["タイトルは必須です"],
      "slots[0].capacity": ["定員は1以上です"],
      "tickets[0].name": ["required"],
    };
    const result = groupTicketFieldErrors(input);
    expect(result.size).toBe(1);
    expect(result.get(0)).toEqual({ name: ["required"] });
  });

  test("undefined input returns empty map", () => {
    expect(groupTicketFieldErrors(undefined).size).toBe(0);
  });
});

describe("ticket-errors: selectTicketsArrayErrors", () => {
  test("returns the top-level 'tickets' bucket when present", () => {
    expect(
      selectTicketsArrayErrors({
        tickets: ["区分を少なくとも1つ登録してください"],
        "tickets[0].name": ["別のエラー"],
      }),
    ).toEqual(["区分を少なくとも1つ登録してください"]);
  });

  test("returns undefined when only per-row errors exist", () => {
    expect(
      selectTicketsArrayErrors({ "tickets[0].name": ["required"] }),
    ).toBeUndefined();
  });

  test("empty array is normalized to undefined", () => {
    expect(selectTicketsArrayErrors({ tickets: [] })).toBeUndefined();
  });

  test("undefined input returns undefined", () => {
    expect(selectTicketsArrayErrors(undefined)).toBeUndefined();
  });
});

describe("ticket-errors: countTicketFieldErrorGroups", () => {
  test("counts non-empty error entries", () => {
    expect(
      countTicketFieldErrorGroups({
        "tickets[0].name": ["a"],
        "tickets[0].price": ["b"],
        "tickets[1].capacity": ["c"],
        tickets: ["d"],
      }),
    ).toBe(4);
  });

  test("skips null and empty entries", () => {
    expect(
      countTicketFieldErrorGroups({
        "tickets[0].name": null,
        "tickets[0].price": [],
        "tickets[1].capacity": ["real"],
      }),
    ).toBe(1);
  });

  test("undefined input returns 0", () => {
    expect(countTicketFieldErrorGroups(undefined)).toBe(0);
  });
});

/**
 * conform + Zod v4 の実際の出力形式を pin する。
 * TicketsField の per-row 表示は `tickets[N].<field>` という key 命名前提のため、
 * conform 側のフォーマット変更で silent regression になるのを防ぐ。
 */
describe("ticket-errors: eventFormSchema parseWithZod integration", () => {
  function buildFormData(tickets: unknown): FormData {
    const fd = new FormData();
    fd.set("title", "Test event");
    fd.set("slug", "test-event");
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
    fd.set("tickets", JSON.stringify(tickets));
    fd.set("format", "OFFLINE");
    fd.set("meetingProvider", "MANUAL");
    fd.set("gallery", "[]");
    return fd;
  }

  test("empty ticket name yields error key 'tickets[0].name'", () => {
    // 目的: nested Zod path が `tickets[0].name` という conform 命名で
    // exposed される事実を pin する。message 自体は conform の empty→undefined
    // coercion で Zod default (`Invalid input: expected string, received undefined`)
    // に置き換わるため、値ではなく key の存在と shape のみ検証する。
    const fd = buildFormData([
      {
        name: "",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ]);
    const result = parseWithZod(fd, { schema: eventFormSchema });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).not.toBeNull();
    const nameErrors = result.error?.["tickets[0].name"];
    expect(Array.isArray(nameErrors)).toBe(true);
    expect(nameErrors?.length ?? 0).toBeGreaterThan(0);
  });

  test("multi-ticket missing capacity yields 'tickets[N].capacity' keys", () => {
    const fd = buildFormData([
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "学生",
        description: null,
        price: 3000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ]);
    const result = parseWithZod(fd, { schema: eventFormSchema });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error?.["tickets[0].capacity"]).toEqual([
      "区分が複数のときは枠数を入力してください",
    ]);
    expect(result.error?.["tickets[1].capacity"]).toEqual([
      "区分が複数のときは枠数を入力してください",
    ]);
  });

  test("empty tickets array yields top-level 'tickets' key", () => {
    const fd = buildFormData([]);
    const result = parseWithZod(fd, { schema: eventFormSchema });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error?.["tickets"]).toEqual([
      "区分を少なくとも1つ登録してください",
    ]);
  });

  test("full round-trip (mixed item-level + array-refine): parseWithZod → groupTicketFieldErrors", () => {
    // 混在ケース: 個別アイテムの price エラー (row 0) と、複数区分の capacity 必須
    // (row 0 と row 1 双方) が同時に上がる。Zod v4 の superRefine は array item parse の
    // 失敗があっても引き続き発火するため、行単位の複数フィールドエラーが同時に UI に
    // 表示されることを pin する。
    const fd = buildFormData([
      {
        name: "一般",
        description: null,
        price: -100,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "学生",
        description: null,
        price: 3000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ]);
    const result = parseWithZod(fd, { schema: eventFormSchema });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    const grouped = groupTicketFieldErrors(result.error ?? undefined);
    const row0 = grouped.get(0);
    expect(row0?.["price"]).toEqual(["料金は0以上です"]);
    expect(row0?.["capacity"]).toEqual([
      "区分が複数のときは枠数を入力してください",
    ]);
    const row1 = grouped.get(1);
    expect(row1?.["capacity"]).toEqual([
      "区分が複数のときは枠数を入力してください",
    ]);
  });

  test("array-refine only (all items parse-valid): capacity errors fan across rows", () => {
    const fd = buildFormData([
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "学生",
        description: null,
        price: 3000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ]);
    const result = parseWithZod(fd, { schema: eventFormSchema });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    const grouped = groupTicketFieldErrors(result.error ?? undefined);
    expect(grouped.get(0)?.["capacity"]).toEqual([
      "区分が複数のときは枠数を入力してください",
    ]);
    expect(grouped.get(1)?.["capacity"]).toEqual([
      "区分が複数のときは枠数を入力してください",
    ]);
  });
});
