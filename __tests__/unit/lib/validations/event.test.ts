import { describe, expect, it } from "bun:test";
import {
  eventFormSchema,
  updateEventSchema,
} from "@/shared/lib/validations/event";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

describe("eventFormSchema", () => {
  const validInput = {
    title: "テストイベント",
    slug: "test-event",
    descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    startTime: "2026-05-01T10:00:00.000Z",
    endTime: "2026-05-01T12:00:00.000Z",
    status: "DRAFT",
  };

  it("有効な入力を受け入れる", () => {
    const result = eventFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("タイトルが空の場合エラー", () => {
    const result = eventFormSchema.safeParse({ ...validInput, title: "" });
    expect(result.success).toBe(false);
  });

  it("終了時刻が開始時刻より前の場合エラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      startTime: "2026-05-01T12:00:00.000Z",
      endTime: "2026-05-01T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("定員が0以下の場合エラー", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: 0 });
    expect(result.success).toBe(false);
  });

  it("定員がnullの場合は無制限として受け入れる", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: null });
    expect(result.success).toBe(true);
  });

  it("無効なステータスを拒否する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("オプションフィールドを受け入れる", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      description: "説明文",
      capacity: 30,
      price: 1000,
      addressDetail: "2F 会議室A",
      locationId: "11111111-1111-4111-8111-111111111111",
      spaceId: "22222222-2222-4222-8222-222222222222",
      registrationOpen: true,
      thumbnailUrl: "https://example.com/image.jpg",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateEventSchema", () => {
  it("idが必須", () => {
    const result = updateEventSchema.safeParse({
      title: "更新",
      slug: "update",
      startTime: "2026-05-01T10:00:00.000Z",
      endTime: "2026-05-01T12:00:00.000Z",
      status: "DRAFT",
    });
    expect(result.success).toBe(false);
  });

  it("有効な更新入力を受け入れる", () => {
    const result = updateEventSchema.safeParse({
      id: "test-id",
      title: "更新イベント",
      slug: "updated-event",
      descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      startTime: "2026-05-01T10:00:00.000Z",
      endTime: "2026-05-01T12:00:00.000Z",
      status: "PUBLISHED",
    });
    expect(result.success).toBe(true);
  });
});
