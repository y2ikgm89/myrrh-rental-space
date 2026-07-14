import { describe, expect, it } from "bun:test";
import {
  publicEventWaitlistRegistrationSchema,
  publicEventWaitlistConfirmSchema,
} from "@/shared/lib/validations/event-registration";

describe("publicEventWaitlistRegistrationSchema", () => {
  const validInput = {
    eventId: "cm0event1234567890123456",
    ticketId: "cm0ticket1234567890123",
    slotId: "uvslot123456789012345678",
    name: "山田太郎",
    email: "yamada@example.com",
    quantity: 2,
    turnstileToken: "token-abc",
  };

  it("有効な入力を受け入れる（全必須フィールド + turnstileToken）", () => {
    const result = publicEventWaitlistRegistrationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("無効なメールアドレスを拒否する", () => {
    const result = publicEventWaitlistRegistrationSchema.safeParse({
      ...validInput,
      email: "invalid-email",
    });
    expect(result.success).toBe(false);
  });

  it("quantity が 0 の場合拒否する", () => {
    const result = publicEventWaitlistRegistrationSchema.safeParse({
      ...validInput,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("publicEventWaitlistConfirmSchema", () => {
  it("token と turnstileToken が揃っていれば受け入れる", () => {
    const result = publicEventWaitlistConfirmSchema.safeParse({
      token: "encrypted-token-abc123",
      turnstileToken: "turnstile-token-xyz",
    });
    expect(result.success).toBe(true);
  });

  it("token が空の場合拒否する", () => {
    const result = publicEventWaitlistConfirmSchema.safeParse({
      token: "",
      turnstileToken: "turnstile-token-xyz",
    });
    expect(result.success).toBe(false);
  });
});
