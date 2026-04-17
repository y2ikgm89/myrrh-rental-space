import { describe, expect, it } from "bun:test";
import {
  EMAIL_TEMPLATE_TYPE,
  EMAIL_TEMPLATE_TYPE_LABELS,
  isValidEmailTemplateType,
} from "@/shared/lib/validations/enums/helpers";

describe("EMAIL_TEMPLATE_TYPE", () => {
  it("全 17 種の type が定義されている", () => {
    expect(Object.values(EMAIL_TEMPLATE_TYPE)).toHaveLength(17);
  });

  it("全 type に日本語ラベルが定義されている", () => {
    for (const type of Object.values(EMAIL_TEMPLATE_TYPE)) {
      expect(EMAIL_TEMPLATE_TYPE_LABELS[type]).toBeDefined();
      expect(EMAIL_TEMPLATE_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});

describe("isValidEmailTemplateType", () => {
  it("有効な type を true にする", () => {
    expect(isValidEmailTemplateType("reservation_confirmation")).toBe(true);
    expect(isValidEmailTemplateType("welcome")).toBe(true);
  });

  it("無効な値を false にする", () => {
    expect(isValidEmailTemplateType("invalid")).toBe(false);
    expect(isValidEmailTemplateType("")).toBe(false);
    expect(isValidEmailTemplateType(null)).toBe(false);
    expect(isValidEmailTemplateType(123)).toBe(false);
  });
});
