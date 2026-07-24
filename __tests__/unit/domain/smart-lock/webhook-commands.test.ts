/**
 * isKnownSmartLockDevice / processSwitchBotChangeReport のテスト
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type DeviceRow = { id: string; deviceId: string; deviceType: string };
type PasscodeRow = {
  id: string;
  reservationId: string;
  switchbotKeyId: string | null;
};

const mockFindUniqueDevice = mock<
  (...args: unknown[]) => Promise<DeviceRow | null>
>(() => Promise.resolve(null));
const mockUpdateManyPasscode = mock<
  (...args: unknown[]) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockFindFirstPasscode = mock<
  (...args: unknown[]) => Promise<PasscodeRow | null>
>(() => Promise.resolve(null));
const mockFindManyPasscode = mock<
  (...args: unknown[]) => Promise<PasscodeRow[]>
>(() => Promise.resolve([]));

const mockGetDecryptedSwitchBotCredentials = mock<
  () => Promise<{
    openToken: string;
    secretKey: string;
    passcodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));

const mockCreatePasscodeApi = mock<(...args: unknown[]) => Promise<unknown>>(
  () => Promise.resolve({ ok: true, body: { commandId: "unused" } }),
);

const mockFindKeyInDeviceList = mock<
  (...args: unknown[]) => Promise<
    | {
        ok: true;
        body: {
          id: string;
          name: string;
          type: string;
          password: string;
          iv: string;
          status: string;
          createTime: number;
        } | null;
      }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: null }));

const mockUpdateManyDevice = mock<
  (...args: unknown[]) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockDevice: {
      findUnique: (...args: unknown[]) => mockFindUniqueDevice(...args),
      updateMany: (...args: unknown[]) => mockUpdateManyDevice(...args),
    },
    smartLockPasscode: {
      updateMany: (...args: unknown[]) => mockUpdateManyPasscode(...args),
      findFirst: (...args: unknown[]) => mockFindFirstPasscode(...args),
      findMany: (...args: unknown[]) => mockFindManyPasscode(...args),
    },
  },
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () =>
    mockGetDecryptedSwitchBotCredentials(),
}));

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  createPasscode: (...args: unknown[]) => mockCreatePasscodeApi(...args),
  findKeyInDeviceList: (...args: unknown[]) => mockFindKeyInDeviceList(...args),
  deletePasscode: () => Promise.resolve({ ok: true, body: {} }),
  findKeyByIdInDeviceList: () => Promise.resolve({ ok: true, body: null }),
}));

mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  confirmRevokeByKeyAbsence: mock(() => Promise.resolve(false)),
}));

const {
  isKnownSmartLockDevice,
  processSwitchBotChangeReport,
  processSwitchBotLockStateReport,
} = await import("@/shared/domain/smart-lock/webhook-commands");
const { buildPasscodeName } =
  await import("@/shared/domain/smart-lock/issue-passcode");

const DEVICE: DeviceRow = {
  id: "device-row-1",
  deviceId: "AA:BB:CC:DD:EE:FF",
  deviceType: "LOCK_PRO",
};
const RESERVATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PASSCODE_ROW: PasscodeRow = {
  id: "passcode-1",
  reservationId: RESERVATION_ID,
  switchbotKeyId: "key-1",
};

beforeEach(() => {
  mockFindUniqueDevice.mockReset();
  mockUpdateManyPasscode.mockReset();
  mockFindFirstPasscode.mockReset();
  mockFindManyPasscode.mockReset();
  mockUpdateManyDevice.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockCreatePasscodeApi.mockReset();
  mockFindKeyInDeviceList.mockReset();

  mockFindUniqueDevice.mockResolvedValue(null);
  mockUpdateManyPasscode.mockResolvedValue({ count: 0 });
  mockFindFirstPasscode.mockResolvedValue(null);
  mockFindManyPasscode.mockResolvedValue([]);
  mockUpdateManyDevice.mockResolvedValue({ count: 0 });
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
    openToken: "open-token",
    secretKey: "secret-key",
    passcodeBufferMinutes: 15,
  });
  mockFindKeyInDeviceList.mockResolvedValue({ ok: true, body: null });
});

describe("isKnownSmartLockDevice", () => {
  test("登録済みのdeviceMacはtrueを返す", async () => {
    mockFindUniqueDevice.mockResolvedValue(DEVICE);
    expect(await isKnownSmartLockDevice(DEVICE.deviceId)).toBe(true);
  });
});

describe("processSwitchBotLockStateReport", () => {
  test("錠デバイスの lockState を lastLockState に反映する", async () => {
    mockFindUniqueDevice.mockResolvedValue(DEVICE);
    mockUpdateManyDevice.mockResolvedValue({ count: 1 });

    const result = await processSwitchBotLockStateReport({
      deviceMac: DEVICE.deviceId,
      lockState: "LOCKED",
      battery: 90,
      timeOfSample: 1_700_000_000,
    });

    expect(result).toBe(true);
    expect(mockUpdateManyDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deviceId: DEVICE.deviceId },
        data: expect.objectContaining({
          lastLockState: "LOCKED",
          lastBattery: 90,
        }),
      }),
    );
  });
});

describe("processSwitchBotChangeReport createKey", () => {
  test("eventName が trim され createKey として処理される", async () => {
    mockFindUniqueDevice.mockResolvedValue(DEVICE);
    mockFindFirstPasscode.mockResolvedValue({
      id: PASSCODE_ROW.id,
      reservationId: PASSCODE_ROW.reservationId,
      switchbotKeyId: null,
    });
    const expectedName = buildPasscodeName(RESERVATION_ID, DEVICE.id);
    mockFindKeyInDeviceList.mockResolvedValue({
      ok: true,
      body: {
        id: "key-1",
        name: expectedName,
        type: "timeLimit",
        password: "enc",
        iv: "iv",
        status: "normal",
        createTime: 1,
      },
    });
    mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

    const result = await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: " createKey ",
      commandId: "cmd-1",
      result: "success",
    });

    expect(result).toBe(true);
    expect(mockFindKeyInDeviceList).toHaveBeenCalled();
  });

  test("createKey failed は PENDING を FAILED に倒す", async () => {
    mockFindUniqueDevice.mockResolvedValue(DEVICE);
    mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

    const result = await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: "createKey",
      commandId: "cmd-1",
      result: "failed",
    });

    expect(result).toBe(true);
    expect(mockUpdateManyPasscode).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});

describe("processSwitchBotChangeReport deleteKey", () => {
  beforeEach(() => {
    mockFindUniqueDevice.mockResolvedValue(DEVICE);
  });

  test("eventName deleteKey (末尾スペース) を trim して処理する", async () => {
    mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
    mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

    const result = await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: "deleteKey ",
      commandId: "del-cmd-1",
      result: "success",
    });

    expect(result).toBe(true);
    expect(mockUpdateManyPasscode).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "REVOKE_PENDING" }),
        data: expect.objectContaining({ status: "REVOKED" }),
      }),
    );
  });

  test("deleteKey success は switchbotDeleteCommandId で相関して REVOKED", async () => {
    mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
    mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

    await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: "deleteKey",
      commandId: "del-cmd-2",
      result: "success",
    });

    expect(mockFindFirstPasscode).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          switchbotDeleteCommandId: "del-cmd-2",
          status: "REVOKE_PENDING",
        }),
      }),
    );
  });

  test("deleteKey failed は REVOKE_PENDING を CONFIRMED に戻す", async () => {
    mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
    mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

    const result = await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: "deleteKey",
      commandId: "del-cmd-3",
      result: "failed",
    });

    expect(result).toBe(true);
    expect(mockUpdateManyPasscode).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONFIRMED",
          switchbotDeleteCommandId: null,
          revokeRequestedAt: null,
        }),
      }),
    );
  });

  test("commandId 無し + keyName で相関できる", async () => {
    mockFindFirstPasscode.mockResolvedValue(null);
    const expectedName = buildPasscodeName(RESERVATION_ID, DEVICE.id);
    mockFindManyPasscode.mockResolvedValue([PASSCODE_ROW]);
    mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

    const result = await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: "deleteKey",
      result: "success",
      keyName: expectedName,
    });

    expect(result).toBe(true);
  });

  test("device 上 REVOKE_PENDING が 1 件だけなら commandId 無しでも相関", async () => {
    mockFindFirstPasscode.mockResolvedValue(null);
    mockFindManyPasscode.mockResolvedValue([PASSCODE_ROW]);
    mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

    const result = await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: "deleteKey",
      result: "success",
    });

    expect(result).toBe(true);
  });
});
