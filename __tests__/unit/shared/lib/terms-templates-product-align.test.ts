import { describe, expect, it } from "bun:test";
import {
  applyBusinessInfo,
  getTemplateById,
  TERMS_TEMPLATES,
  type BusinessInfo,
} from "@/shared/lib/terms-templates";

const EMPTY_BUSINESS_INFO: BusinessInfo = {
  businessName: null,
  representativeName: null,
  registrationNumber: null,
  invoiceNumber: null,
  email: null,
  phoneNumber: null,
  faxNumber: null,
  postalCode: null,
  prefecture: null,
  city: null,
  streetAddress: null,
  buildingName: null,
};

function templateContent(
  termsType: keyof typeof TERMS_TEMPLATES,
  templateId: string,
): string {
  const template = getTemplateById(termsType, templateId);
  if (!template) {
    throw new Error(`template not found: ${termsType}/${templateId}`);
  }
  return applyBusinessInfo(template.content, EMPTY_BUSINESS_INFO);
}

const FORBIDDEN_PRODUCT_PHRASES = [
  "請求書払い",
  "源泉徴収",
  "ご利用開始 7 日前まで",
  "取消しを主張することはできません",
] as const;

describe("terms-templates product alignment", () => {
  it("exports all standard template types", () => {
    expect(TERMS_TEMPLATES["terms-of-use"].length).toBeGreaterThan(0);
    expect(TERMS_TEMPLATES["privacy-policy"].length).toBeGreaterThan(0);
    expect(TERMS_TEMPLATES.cancellation.length).toBeGreaterThan(0);
    expect(TERMS_TEMPLATES.payment.length).toBeGreaterThan(0);
    expect(TERMS_TEMPLATES["commercial-transaction"].length).toBeGreaterThan(0);
    expect(TERMS_TEMPLATES["cookie-policy"].length).toBeGreaterThan(0);
  });

  it("payment, cancellation, and tokushoho templates mention Stripe and omit removed rails", () => {
    const payment = templateContent("payment", "payment-terms");
    const cancellation = templateContent("cancellation", "cancellation-policy");
    const tokushoho = templateContent(
      "commercial-transaction",
      "commercial-transaction",
    );

    for (const content of [payment, cancellation, tokushoho]) {
      expect(content).toContain("Stripe");
    }

    for (const content of [payment, cancellation, tokushoho]) {
      for (const phrase of FORBIDDEN_PRODUCT_PHRASES) {
        expect(content).not.toContain(phrase);
      }
    }
  });

  it("terms-of-use avoids minor cancellation waiver language", () => {
    const termsOfUse = templateContent("terms-of-use", "terms-of-use");

    expect(termsOfUse).not.toContain("取消しを主張することはできません");
    expect(termsOfUse).toContain("法定代理人");
    expect(termsOfUse).toContain("Stripe Checkout");
  });

  it("privacy policy covers inquiry attachments and smart lock passcodes", () => {
    const privacy = templateContent("privacy-policy", "privacy-policy");

    expect(privacy).toContain("お問い合わせ");
    expect(
      privacy.includes("添付") ||
        privacy.includes("非公開") ||
        privacy.includes("private"),
    ).toBe(true);

    expect(
      privacy.includes("パスコード") ||
        privacy.includes("スマートロック") ||
        privacy.includes("SwitchBot"),
    ).toBe(true);
  });

  it("cookie policy describes analytics consent banner scope", () => {
    const cookie = templateContent("cookie-policy", "cookie-policy");

    expect(
      cookie.includes("アクセス解析") || cookie.includes("analytics"),
    ).toBe(true);
    expect(cookie).toContain("同意");
    expect(cookie).toContain("Cookie 同意バナー");
  });

  it("cancellation policy refers to admin-configured refund policy tiers", () => {
    const cancellation = templateContent("cancellation", "cancellation-policy");

    expect(
      cancellation.includes("返金ポリシー") || cancellation.includes("返金率"),
    ).toBe(true);
    expect(cancellation).toContain("クーポン");
    expect(cancellation).toContain("UNPAID");
  });

  it("tokushoho uses phone hours placeholder", () => {
    const tokushoho = templateContent(
      "commercial-transaction",
      "commercial-transaction",
    );

    expect(tokushoho).toContain("【電話受付時間を入力してください】");
    expect(tokushoho).not.toContain("平日 10:00〜18:00");
  });
});
