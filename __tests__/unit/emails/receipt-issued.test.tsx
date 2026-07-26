import { describe, test, expect } from "bun:test";
import { isValidElement } from "react";
import { ReceiptIssuedEmail } from "@/shared/emails/receipt-issued";
import { receiptIssuedFixture } from "@/shared/emails/receipt-issued.fixture";

type EmailLayoutElementProps = {
  preview?: string;
  footer?: unknown;
  children?: unknown;
};

describe("ReceiptIssuedEmail component", () => {
  test("returns a React element wrapped in EmailLayout", () => {
    const el = ReceiptIssuedEmail(receiptIssuedFixture);
    expect(isValidElement<EmailLayoutElementProps>(el)).toBe(true);
    if (!isValidElement<EmailLayoutElementProps>(el)) {
      throw new Error("ReceiptIssuedEmail must return a React element");
    }
    expect(el.props.preview).toContain("領収書を発行しました");
    expect(el.props.footer).toBeTruthy();
  });

  test("includes receipt fields and detailUrl CTA in the tree", () => {
    const el = ReceiptIssuedEmail(receiptIssuedFixture);
    const json = JSON.stringify(el);
    expect(json).toContain(receiptIssuedFixture.serialNo);
    expect(json).toContain(receiptIssuedFixture.recipientName);
    expect(json).toContain(receiptIssuedFixture.amount);
    expect(json).toContain(receiptIssuedFixture.detailUrl);
    expect(json).toContain("詳細を確認する");
  });
});
