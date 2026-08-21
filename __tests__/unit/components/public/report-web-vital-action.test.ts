import { describe, expect, test } from "bun:test";

import { reportWebVitalAction } from "@/app/(public)/_shared/components/analytics/report-web-vital-action";

describe("reportWebVitalAction", () => {
  test("accepts allowed metric names without throwing", async () => {
    await expect(
      reportWebVitalAction({ name: "LCP", value: 1234.5 }),
    ).resolves.toBeUndefined();
    await expect(
      reportWebVitalAction({ name: "CLS", value: 0.12 }),
    ).resolves.toBeUndefined();
  });

  test("ignores unknown metric names and non-finite values", async () => {
    await expect(
      reportWebVitalAction({ name: "FID", value: 10 }),
    ).resolves.toBeUndefined();
    await expect(
      reportWebVitalAction({ name: "LCP", value: Number.NaN }),
    ).resolves.toBeUndefined();
  });
});
