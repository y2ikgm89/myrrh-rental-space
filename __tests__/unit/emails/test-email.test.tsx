import { describe, test, expect } from "bun:test";
import { TestEmail } from "@/shared/emails/test-email";
import type { ReactElement } from "react";

function getProps() {
  return {
    recipientLabel: "delivered@resend.dev",
    siteName: "Myrrh Rental Space",
    timestamp: "2026-06-21 12:00 JST",
    triggeredByName: "Admin User",
    triggeredByEmail: "admin@example.com",
  };
}

describe("TestEmail component", () => {
  test("returns a React element rooted in Html with lang=ja", () => {
    const el = TestEmail(getProps()) as ReactElement<{
      lang?: string;
      children: unknown;
    }>;
    expect(el).toBeTruthy();
    expect(el.props.lang).toBe("ja");
  });

  test("includes all props as renderable values in the tree", () => {
    const el = TestEmail(getProps());
    const json = JSON.stringify(el);
    expect(json).toContain("delivered@resend.dev");
    expect(json).toContain("Myrrh Rental Space");
    expect(json).toContain("2026-06-21 12:00 JST");
    expect(json).toContain("Admin User");
    expect(json).toContain("admin@example.com");
    expect(json).toContain("テスト送信");
  });

  test("includes #0066cc accent color for links", () => {
    const el = TestEmail(getProps());
    const json = JSON.stringify(el);
    expect(json).toContain("#0066cc");
  });
});
