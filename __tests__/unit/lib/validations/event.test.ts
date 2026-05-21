import { describe, expect, it } from "bun:test";
import { eventFormSchema } from "@/app/(admin)/admin/(dashboard)/events/_components/event-form-schema";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

describe("eventFormSchema (conform)", () => {
  const validInput = {
    title: "テストイベント",
    slug: "test-event",
    descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    descriptionHtml: "",
    startTime: "2026-05-01T10:00",
    endTime: "2026-05-01T12:00",
    status: "DRAFT",
    registrationOpen: false,
    tickets: JSON.stringify([
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        sortOrder: 0,
        isAvailable: true,
      },
    ]),
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
      startTime: "2026-05-01T12:00",
      endTime: "2026-05-01T10:00",
    });
    expect(result.success).toBe(false);
  });

  it("定員が0以下の場合エラー", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: 0 });
    expect(result.success).toBe(false);
  });

  it("定員が null の場合は無制限として受け入れる", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: null });
    expect(result.success).toBe(true);
  });

  it("定員が空文字の場合 null として受け入れる (FormData transit)", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBeNull();
    }
  });

  it("定員が string '5' で number 5 にコース", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: "5" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBe(5);
    }
  });

  it("チケットの料金が負の値はエラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      tickets: JSON.stringify([
        {
          name: "一般",
          price: -100,
          unitSize: 1,
          sortOrder: 0,
          isAvailable: true,
        },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("チケット未登録 (空配列) はエラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      tickets: JSON.stringify([]),
    });
    expect(result.success).toBe(false);
  });

  it("無効なステータスを拒否する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("registrationOpen が 'on' 文字列で true にコース (FormData transit)", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationOpen: "on",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.registrationOpen).toBe(true);
    }
  });

  it("registrationOpen が空文字で false にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationOpen: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.registrationOpen).toBe(false);
    }
  });

  it("locationId が __none__ sentinel で null にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      locationId: "__none__",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locationId).toBeNull();
    }
  });

  it("spaceId が __none__ sentinel で null にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      spaceId: "__none__",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spaceId).toBeNull();
    }
  });

  it("申込締切が開始時刻以降の場合エラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationDeadline: "2026-05-01T15:00",
    });
    expect(result.success).toBe(false);
  });

  it("申込締切が開始時刻と同じ場合 OK (start 以前 = ≤)", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationDeadline: "2026-05-01T10:00",
    });
    expect(result.success).toBe(true);
  });

  it("申込締切が空文字でも OK (任意)", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationDeadline: "",
    });
    expect(result.success).toBe(true);
  });

  it("オプションフィールドを受け入れる", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
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

  it("addressDetail が空文字で null にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      addressDetail: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addressDetail).toBeNull();
    }
  });
});
