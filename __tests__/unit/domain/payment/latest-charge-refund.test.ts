import { describe, expect, test } from "bun:test";

import { pickLatestChargeRefund } from "@/shared/domain/payment/stripe-webhook/latest-charge-refund";

describe("pickLatestChargeRefund", () => {
  test("returns undefined when the list is missing or empty", () => {
    expect(pickLatestChargeRefund(undefined)).toBeUndefined();
    expect(pickLatestChargeRefund(null)).toBeUndefined();
    expect(pickLatestChargeRefund({ data: [] })).toBeUndefined();
  });

  test("picks the newest created even when data[0] is older", () => {
    const older = { id: "re_old", created: 1_700_000_000 };
    const newer = { id: "re_new", created: 1_700_000_100 };
    const latest = pickLatestChargeRefund({ data: [older, newer] });

    expect(latest?.id).toBe("re_new");
  });

  test("keeps data[0] when Stripe's documented newest-first order holds", () => {
    const newest = { id: "re_0", created: 300 };
    const older = { id: "re_1", created: 200 };
    expect(pickLatestChargeRefund({ data: [newest, older] })?.id).toBe("re_0");
  });
});
