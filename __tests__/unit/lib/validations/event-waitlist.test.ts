import { describe, expect, it } from "bun:test";
import {
  publicEventWaitlistRegistrationSchema,
  publicEventWaitlistConfirmSchema,
} from "@/shared/lib/validations/event-registration";

describe("publicEventWaitlistRegistrationSchema", () => {
  const validInput = {
    eventId: "0baaa247-7a6c-4938-893c-a0a9c382b12b",
    ticketId: "96e83639-0c13-4eb1-8de3-8e6fe7892ba9",
    slotId: "f4becb6e-69df-4871-8998-ccc37decf00c",
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
