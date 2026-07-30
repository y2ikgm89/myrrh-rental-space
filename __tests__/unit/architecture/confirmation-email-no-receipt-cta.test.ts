/**
 * Confirmation emails must not embed receipt download CTAs.
 * Receipt delivery is via sendReceiptIssuedEmail / notify-issued SSoT.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, ...relativePath.split("/")), "utf8");
}

const CONFIRMATION_SURFACES = [
  "src/shared/lib/email/reservation-emails.ts",
  "src/shared/lib/email/event-emails.ts",
  "src/shared/emails/reservation-confirmation.tsx",
  "src/shared/emails/event-registration-confirmation.tsx",
  "src/shared/emails/reservation-confirmation.fixture.ts",
  "src/shared/emails/event-registration-confirmation.fixture.ts",
  "src/shared/lib/email/types.ts",
] as const;

describe("confirmation email: no receipt CTA", () => {
  test("confirmation builders/templates must not mention receiptDownloadUrl", () => {
    const offenders: string[] = [];
    for (const path of CONFIRMATION_SURFACES) {
      const source = read(path);
      if (source.includes("receiptDownloadUrl")) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("ReservationEmailData / event confirmation data must not expose receiptSerialNo", () => {
    const reservationTypes = read("src/shared/lib/email/types.ts");
    const eventEmails = read("src/shared/lib/email/event-emails.ts");

    // ReceiptIssuedEmailData may still mention serialNo; ban only the removed
    // confirmation-email field name.
    expect(reservationTypes).not.toMatch(
      /export type ReservationEmailData = \{[\s\S]*?receiptSerialNo[\s\S]*?\};/u,
    );
    // event-emails.ts の型は export されていないため、export 有無を要求すると
    // 恒久的に不一致で空振りする（Phase C 監査で判明）。export の有無を問わず検証する。
    expect(eventEmails).not.toMatch(
      /type EventRegistrationConfirmationData = \{[\s\S]*?receiptSerialNo[\s\S]*?\};/u,
    );
  });

  test("receipt-resend and receipt-issued keep receiptDownloadUrl / detail CTA surfaces", () => {
    const resend = read("src/shared/emails/receipt-resend.tsx");
    const receiptEmails = read("src/shared/lib/email/receipt-emails.ts");
    expect(resend).toContain("receiptDownloadUrl");
    expect(receiptEmails).toContain("receiptDownloadUrl");
  });
});
