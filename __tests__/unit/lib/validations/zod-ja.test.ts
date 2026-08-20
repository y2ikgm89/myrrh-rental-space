import { describe, expect, test } from "bun:test";
import { z } from "zod";

import "@/shared/lib/validations/zod-ja";
import { smartLockDeviceFormSchema } from "@/admin/lib/validations/smart-lock-device";
import { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";

describe("zod 日本語ロケール", () => {
  test("未指定の invalid_type は日本語になる", () => {
    const result = z.string().safeParse(undefined);
    expect(result.success).toBe(false);
    const message = result.success
      ? ""
      : (result.error.issues[0]?.message ?? "");
    expect(message).toContain("無効な入力");
  });

  test("フィールド別 error 指定はロケールに優先する", () => {
    const result = smartLockDeviceFormSchema.safeParse({
      locationId: "00000000-0000-4000-8000-000000000001",
      deviceId: "",
      deviceName: "玄関 Keypad",
      deviceType: SmartLockDeviceType.KEYPAD,
      isActive: true,
    });
    expect(result.success).toBe(false);
    const deviceIdIssue = result.success
      ? undefined
      : result.error.issues.find((issue) => issue.path[0] === "deviceId");
    expect(deviceIdIssue?.message).toBe(
      "デバイスID（MACアドレス）を入力してください",
    );
  });
});
