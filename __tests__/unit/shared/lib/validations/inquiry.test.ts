import { describe, test, expect } from "bun:test";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";

describe("publicInquirySchema", () => {
  const VALID_PERSONAL = {
    customerType: "personal" as const,
    lastName: "山田",
    firstName: "太郎",
    email: "test@example.com",
    subject: "スペースについて",
    message: "利用可能な日程を教えてください。",
  };

  const VALID_CORPORATE = {
    ...VALID_PERSONAL,
    customerType: "corporate" as const,
    companyName: "株式会社テスト",
  };

  test("valid personal input passes", () => {
    const result = publicInquirySchema.safeParse(VALID_PERSONAL);
    expect(result.success).toBe(true);
  });

  test("valid corporate input passes", () => {
    const result = publicInquirySchema.safeParse(VALID_CORPORATE);
    expect(result.success).toBe(true);
  });

  test("corporate without companyName fails", () => {
    const result = publicInquirySchema.safeParse({
      ...VALID_CORPORATE,
      companyName: "",
    });
    expect(result.success).toBe(false);
  });

  test("personal without companyName passes", () => {
    const result = publicInquirySchema.safeParse({
      ...VALID_PERSONAL,
      companyName: "",
    });
    expect(result.success).toBe(true);
  });

  test("defaults to personal when customerType omitted", () => {
    const { customerType: _, ...withoutType } = VALID_PERSONAL;
    const result = publicInquirySchema.safeParse(withoutType);
    expect(result.success).toBe(true);
  });

  test("rejects empty lastName", () => {
    const result = publicInquirySchema.safeParse({
      ...VALID_PERSONAL,
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty firstName", () => {
    const result = publicInquirySchema.safeParse({
      ...VALID_PERSONAL,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email", () => {
    const result = publicInquirySchema.safeParse({
      ...VALID_PERSONAL,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  test("rejects message over 5000 chars", () => {
    const result = publicInquirySchema.safeParse({
      ...VALID_PERSONAL,
      message: "あ".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  test("optional turnstileToken", () => {
    const result = publicInquirySchema.safeParse({
      ...VALID_PERSONAL,
      turnstileToken: "token123",
    });
    expect(result.success).toBe(true);
  });
});
