import { describe, test, expect } from "bun:test";
import { render } from "@react-email/render";
import { CustomerMergeVerificationEmail } from "@/shared/emails/customer-merge-verification";
import { customerMergeVerificationFixture } from "@/shared/emails/customer-merge-verification.fixture";

describe("CustomerMergeVerificationEmail", () => {
  test("renders merge preview counts and verification CTA", async () => {
    const html = await render(
      CustomerMergeVerificationEmail(customerMergeVerificationFixture),
    );
    expect(html).toContain("履歴統合の確認");
    expect(html).toContain(customerMergeVerificationFixture.guestEmail);
    expect(html).toContain("予約: 2 件");
    expect(html).toContain("履歴統合を確認する");
    expect(html).toContain(customerMergeVerificationFixture.verificationUrl);
  });
});
