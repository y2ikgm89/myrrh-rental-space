import { describe, expect, test } from "bun:test";
import { syncLocationStub } from "@/shared/lib/google-business-profile/stub";

describe("syncLocationStub", () => {
  test("locationId をそのまま返し、syncedAt は現在時刻", async () => {
    const before = Date.now();
    const result = await syncLocationStub({ locationId: "loc-1" });
    const after = Date.now();
    expect(result.locationId).toBe("loc-1");
    expect(result.syncedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.syncedAt.getTime()).toBeLessThanOrEqual(after);
  });

  test("複数の異なる locationId に対して独立して動作する", async () => {
    const result1 = await syncLocationStub({ locationId: "loc-a" });
    const result2 = await syncLocationStub({ locationId: "loc-b" });
    expect(result1.locationId).toBe("loc-a");
    expect(result2.locationId).toBe("loc-b");
  });

  test("syncedAt は Date インスタンス", async () => {
    const result = await syncLocationStub({ locationId: "loc-1" });
    expect(result.syncedAt).toBeInstanceOf(Date);
  });
});
