/**
 * assertDeviceMatchesSwitchBotInventory — Device List 突合の fail-closed 検証
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";

const mockGetDecryptedSwitchBotCredentials = mock<
  () => Promise<{
    openToken: string;
    secretKey: string;
    passcodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));

const mockFindDeviceInDeviceList = mock<
  (
    credentials: unknown,
    deviceId: string,
  ) => Promise<
    | {
        ok: true;
        body: { deviceId: string; deviceType: string } | null;
      }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: null }));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () =>
    mockGetDecryptedSwitchBotCredentials(),
}));

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  findDeviceInDeviceList: (credentials: unknown, deviceId: string) =>
    mockFindDeviceInDeviceList(credentials, deviceId),
  resolveSwitchBotDeviceFamily: (switchBotDeviceType: string) => {
    const normalized = switchBotDeviceType.trim().toLowerCase();
    if (normalized.includes("keypad")) return "pad";
    if (normalized.includes("lock")) return "lock";
    return null;
  },
}));

const { assertDeviceMatchesSwitchBotInventory } =
  await import("@/shared/domain/smart-lock/device-inventory");

beforeEach(() => {
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockFindDeviceInDeviceList.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
    openToken: "token",
    secretKey: "secret",
    passcodeBufferMinutes: 15,
  });
  mockFindDeviceInDeviceList.mockResolvedValue({ ok: true, body: null });
});

describe("assertDeviceMatchesSwitchBotInventory", () => {
  test("資格情報なし（連携 OFF）はスキップする", async () => {
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);

    await expect(
      assertDeviceMatchesSwitchBotInventory(
        "AA:BB:CC:DD:EE:FF",
        SmartLockDeviceType.KEYPAD,
      ),
    ).resolves.toBeUndefined();
    expect(mockFindDeviceInDeviceList).not.toHaveBeenCalled();
  });

  test("Device List に存在しない deviceId は拒否する", async () => {
    await expect(
      assertDeviceMatchesSwitchBotInventory(
        "AA:BB:CC:DD:EE:FF",
        SmartLockDeviceType.KEYPAD,
      ),
    ).rejects.toThrow("SwitchBot アカウントに存在しません");
  });

  test("pad/lock 家族不一致は拒否する", async () => {
    mockFindDeviceInDeviceList.mockResolvedValue({
      ok: true,
      body: { deviceId: "AA:BB:CC:DD:EE:FF", deviceType: "Smart Lock Pro" },
    });

    await expect(
      assertDeviceMatchesSwitchBotInventory(
        "AA:BB:CC:DD:EE:FF",
        SmartLockDeviceType.KEYPAD,
      ),
    ).rejects.toThrow("機種（Keypad / Lock）が選択した機種と一致しません");
  });

  test("家族一致なら通過する", async () => {
    mockFindDeviceInDeviceList.mockResolvedValue({
      ok: true,
      body: { deviceId: "AA:BB:CC:DD:EE:FF", deviceType: "Keypad Touch" },
    });

    await expect(
      assertDeviceMatchesSwitchBotInventory(
        "AA:BB:CC:DD:EE:FF",
        SmartLockDeviceType.KEYPAD_TOUCH,
      ),
    ).resolves.toBeUndefined();
  });

  test("Device List API 失敗は fail closed", async () => {
    mockFindDeviceInDeviceList.mockResolvedValue({
      ok: false,
      statusCode: 190,
      message: "device offline",
    });

    await expect(
      assertDeviceMatchesSwitchBotInventory(
        "AA:BB:CC:DD:EE:FF",
        SmartLockDeviceType.LOCK,
      ),
    ).rejects.toThrow("device offline");
  });
});
