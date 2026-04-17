import { describe, expect, it } from "bun:test";
import {
  EMAIL_TEMPLATE_VARIABLES,
  getTemplateVariables,
} from "@/shared/lib/email/template-registry";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";

describe("EMAIL_TEMPLATE_VARIABLES", () => {
  it("全 17 種の type に変数リストが定義されている", () => {
    for (const type of Object.values(EMAIL_TEMPLATE_TYPE)) {
      expect(EMAIL_TEMPLATE_VARIABLES[type]).toBeDefined();
      expect(Array.isArray(EMAIL_TEMPLATE_VARIABLES[type])).toBe(true);
      expect(EMAIL_TEMPLATE_VARIABLES[type].length).toBeGreaterThan(0);
    }
  });

  it("変数定義には name と description が含まれる", () => {
    const variables =
      EMAIL_TEMPLATE_VARIABLES[EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION];
    for (const v of variables) {
      expect(v.name).toBeDefined();
      expect(v.description).toBeDefined();
    }
  });
});

describe("getTemplateVariables", () => {
  it("指定 type の変数リストを返す", () => {
    const vars = getTemplateVariables(
      EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION,
    );
    const names = vars.map((v) => v.name);
    expect(names).toContain("customerName");
    expect(names).toContain("spaceName");
    expect(names).toContain("totalPrice");
  });
});
