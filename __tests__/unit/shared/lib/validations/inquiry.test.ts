import { describe, test, expect } from "bun:test";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";

describe("publicInquirySchema", () => {
  test("valid input passes", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田 太郎",
      email: "test@example.com",
      subject: "スペースについて",
      message: "利用可能な日程を教えてください。",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty name", () => {
    const result = publicInquirySchema.safeParse({
      name: "",
      email: "test@example.com",
      subject: "件名",
      message: "本文",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田",
      email: "not-an-email",
      subject: "件名",
      message: "本文",
    });
    expect(result.success).toBe(false);
  });

  test("rejects message over 5000 chars", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田",
      email: "test@example.com",
      subject: "件名",
      message: "あ".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  test("optional turnstileToken", () => {
    const result = publicInquirySchema.safeParse({
      name: "山田",
      email: "test@example.com",
      subject: "件名",
      message: "本文",
      turnstileToken: "token123",
    });
    expect(result.success).toBe(true);
  });
});
