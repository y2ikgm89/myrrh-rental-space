import { describe, test, expect } from "bun:test";
import { isValidElement } from "react";
import { TestEmail } from "@/shared/emails/test-email";

type EmailLayoutElementProps = {
  preview?: string;
  footer?: unknown;
  children?: unknown;
};

function getFooter() {
  return {
    businessName: "Myrrh Rental Space",
    address: "",
    phoneNumber: null,
    contactEmail: null,
    siteName: "Myrrh Rental Space",
    siteUrl: "https://example.com",
    legalLinks: [],
  };
}

function getProps() {
  return {
    recipientLabel: "delivered@resend.dev",
    siteName: "Myrrh Rental Space",
    timestamp: new Date("2026-06-21T12:00:00+09:00"),
    triggeredByName: "Admin User",
    triggeredByEmail: "admin@example.com",
    footer: getFooter(),
  };
}

describe("TestEmail component", () => {
  test("returns a React element wrapped in EmailLayout", () => {
    const el = TestEmail(getProps());
    expect(isValidElement<EmailLayoutElementProps>(el)).toBe(true);
    if (!isValidElement<EmailLayoutElementProps>(el)) {
      throw new Error("TestEmail must return a React element");
    }
    expect(el.props.preview).toContain("テスト送信");
    expect(el.props.footer).toBeTruthy();
  });

  test("includes all props as renderable values in the tree", () => {
    const el = TestEmail(getProps());
    const json = JSON.stringify(el);
    expect(json).toContain("delivered@resend.dev");
    expect(json).toContain("Myrrh Rental Space");
    expect(json).toContain("2026年6月21日");
    expect(json).toContain("Admin User");
    expect(json).toContain("admin@example.com");
    expect(json).toContain("テスト送信");
  });

  test("includes the canonical link color for links", () => {
    const el = TestEmail(getProps());
    const json = JSON.stringify(el);
    expect(json).toContain("#0b5cd1");
  });
});
