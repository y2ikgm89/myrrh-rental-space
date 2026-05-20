import { describe, expect, it } from "bun:test";
import {
  publicEventRegistrationSchema,
  adminEventRegistrationSchema,
} from "@/shared/lib/validations/event-registration";

describe("publicEventRegistrationSchema", () => {
  const validInput = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    ticketId: "ticket-001",
    name: "山田太郎",
    email: "yamada@example.com",
    quantity: 2,
    turnstileToken: "token-abc",
  };

  it("有効な入力を受け入れる（全必須フィールド + turnstileToken）", () => {
    const result = publicEventRegistrationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("空のnameを拒否する", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("無効なメールアドレスを拒否する", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      email: "invalid-email",
    });
    expect(result.success).toBe(false);
  });

  it("quantity が 0 の場合拒否する", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("quantity が 11 の場合拒否する", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      quantity: 11,
    });
    expect(result.success).toBe(false);
  });

  it("quantity が 1 の場合受け入れる", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      quantity: 1,
    });
    expect(result.success).toBe(true);
  });

  it("quantity のデフォルトは 1", () => {
    const { quantity: _removed, ...withoutNumber } = validInput;
    const result = publicEventRegistrationSchema.safeParse(withoutNumber);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(1);
    }
  });

  it("オプションフィールド（phone, note）を null で受け入れる", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      phone: null,
      note: null,
    });
    expect(result.success).toBe(true);
  });

  it("オプションフィールド（phone, note）に値を受け入れる", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      phone: "090-1234-5678",
      note: "車椅子利用",
    });
    expect(result.success).toBe(true);
  });

  it("turnstileToken が空の場合拒否する", () => {
    const result = publicEventRegistrationSchema.safeParse({
      ...validInput,
      turnstileToken: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("adminEventRegistrationSchema", () => {
  const validInput = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    ticketId: "ticket-001",
    name: "山田太郎",
    email: "yamada@example.com",
    quantity: 1,
  };

  it("有効な入力を受け入れる（turnstileToken 不要）", () => {
    const result = adminEventRegistrationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("空のnameを拒否する", () => {
    const result = adminEventRegistrationSchema.safeParse({
      ...validInput,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("無効なメールアドレスを拒否する", () => {
    const result = adminEventRegistrationSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("quantity が 0 の場合拒否する", () => {
    const result = adminEventRegistrationSchema.safeParse({
      ...validInput,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("quantity に max 制限がない（管理者用）", () => {
    const result = adminEventRegistrationSchema.safeParse({
      ...validInput,
      quantity: 100,
    });
    expect(result.success).toBe(true);
  });

  it("オプションフィールド（phone, note）を null で受け入れる", () => {
    const result = adminEventRegistrationSchema.safeParse({
      ...validInput,
      phone: null,
      note: null,
    });
    expect(result.success).toBe(true);
  });
});
