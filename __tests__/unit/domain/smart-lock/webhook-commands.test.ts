/**
 * isKnownSmartLockDevice / processSwitchBotChangeReport のテスト
 *
 * Prisma / SwitchBot API クライアント / settings クエリをモックする。
 * `processSwitchBotChangeReport` は内部で `./issue-passcode` の
 * `buildPasscodeName`（純粋関数）を実利用するため、issue-passcode モジュール自体は
 * モックしない（その依存先である prisma / api-key-queries / switchbot-client は
 * 本ファイルで既にモック済みのため問題なく読み込める）。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type DeviceRow = { id: string; deviceId: string };
type PasscodeRow = { id: string; reservationId: string };

const mockFindUniqueDevice = mock<
  (...args: unknown[]) => Promise<DeviceRow | null>
>(() => Promise.resolve(null));
const mockUpdateManyPasscode = mock<
  (...args: unknown[]) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockFindFirstPasscode = mock<
  (...args: unknown[]) => Promise<PasscodeRow | null>
>(() => Promise.resolve(null));

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
const mockGetDeviceStatus = mock<
  (...args: unknown[]) => Promise<
    | {
        ok: true;
        body: {
          keyList?: Array<{
            id: string;
            name: string;
            type: string;
            password: string;
            iv: string;
            status: string;
            createTime: number;
          }>;
        };
      }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: { keyList: [] } }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockDevice: {
      findUnique: (...args: unknown[]) => mockFindUniqueDevice(...args),
    },
    smartLockPasscode: {
      updateMany: (...args: unknown[]) => mockUpdateManyPasscode(...args),
      findFirst: (...args: unknown[]) => mockFindFirstPasscode(...args),
    },
  },
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () =>
    mockGetDecryptedSwitchBotCredentials(),
}));

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  createPasscode: (...args: unknown[]) => mockCreatePasscodeApi(...args),
  getDeviceStatus: (...args: unknown[]) => mockGetDeviceStatus(...args),
}));

const { isKnownSmartLockDevice, processSwitchBotChangeReport } =
  await import("@/shared/domain/smart-lock/webhook-commands");
const { buildPasscodeName } =
  await import("@/shared/domain/smart-lock/issue-passcode");

const DEVICE: DeviceRow = { id: "device-row-1", deviceId: "AA:BB:CC:DD:EE:FF" };
const RESERVATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PASSCODE_ROW: PasscodeRow = {
  id: "passcode-1",
  reservationId: RESERVATION_ID,
};

beforeEach(() => {
  mockFindUniqueDevice.mockReset();
  mockUpdateManyPasscode.mockReset();
  mockFindFirstPasscode.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockCreatePasscodeApi.mockReset();
  mockGetDeviceStatus.mockReset();

  mockFindUniqueDevice.mockResolvedValue(null);
  mockUpdateManyPasscode.mockResolvedValue({ count: 0 });
  mockFindFirstPasscode.mockResolvedValue(null);
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
    openToken: "open-token",
    secretKey: "secret-key",
    passcodeBufferMinutes: 15,
  });
  mockGetDeviceStatus.mockResolvedValue({ ok: true, body: { keyList: [] } });
});

describe("isKnownSmartLockDevice", () => {
  test("登録済みのdeviceMacはtrueを返す", async () => {
    mockFindUniqueDevice.mockResolvedValue(DEVICE);

    const result = await isKnownSmartLockDevice(DEVICE.deviceId);

    expect(result).toBe(true);
    expect(mockFindUniqueDevice).toHaveBeenCalledWith({
      where: { deviceId: DEVICE.deviceId },
      select: { id: true },
    });
  });

  test("未知のdeviceMacはfalseを返す", async () => {
    mockFindUniqueDevice.mockResolvedValue(null);

    const result = await isKnownSmartLockDevice("unknown-mac");

    expect(result).toBe(false);
  });
});

describe("processSwitchBotChangeReport", () => {
  test("eventNameがcreateKey以外なら何もせずfalseを返す", async () => {
    const result = await processSwitchBotChangeReport({
      deviceMac: DEVICE.deviceId,
      eventName: "someOtherEvent",
      commandId: "cmd-1",
      result: "success",
    });

    expect(result).toBe(false);
    expect(mockFindUniqueDevice).not.toHaveBeenCalled();
  });

  test("deviceMacが未知(smartLockDevice無し)ならfalseを返す", async () => {
    mockFindUniqueDevice.mockResolvedValue(null);

    const result = await processSwitchBotChangeReport({
      deviceMac: "unknown-mac",
      eventName: "createKey",
      commandId: "cmd-1",
      result: "success",
    });

    expect(result).toBe(false);
    expect(mockFindFirstPasscode).not.toHaveBeenCalled();
  });

  describe("result: failed / timeout", () => {
    test("PENDINGレコードが更新されればtrueを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "failed",
      });

      expect(result).toBe(true);
      expect(mockUpdateManyPasscode).toHaveBeenCalledWith({
        where: {
          switchbotCommandId: "cmd-1",
          deviceId: DEVICE.id,
          status: "PENDING",
        },
        data: expect.objectContaining({
          status: "FAILED",
          failureReason: "SwitchBot webhook: failed",
        }),
      });
    });

    test("timeoutでも同様にFAILEDへ更新する", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "timeout",
      });

      expect(result).toBe(true);
      expect(mockUpdateManyPasscode).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureReason: "SwitchBot webhook: timeout",
          }),
        }),
      );
    });

    test("該当PENDINGレコードが無い場合(count:0)はfalseを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockUpdateManyPasscode.mockResolvedValue({ count: 0 });

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "failed",
      });

      expect(result).toBe(false);
    });
  });

  describe("result: success", () => {
    test("PENDINGレコードが無ければAPI呼出せずfalseを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockFindFirstPasscode.mockResolvedValue(null);

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "success",
      });

      expect(result).toBe(false);
      expect(mockGetDecryptedSwitchBotCredentials).not.toHaveBeenCalled();
      expect(mockGetDeviceStatus).not.toHaveBeenCalled();
    });

    test("SwitchBot連携が未設定(credentials null)ならfalseを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
      mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "success",
      });

      expect(result).toBe(false);
      expect(mockGetDeviceStatus).not.toHaveBeenCalled();
    });

    test("getDeviceStatusが失敗(ok:false)ならfalseを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
      mockGetDeviceStatus.mockResolvedValue({
        ok: false,
        statusCode: 500,
        message: "error",
      });

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "success",
      });

      expect(result).toBe(false);
      expect(mockUpdateManyPasscode).not.toHaveBeenCalled();
    });

    test("keyListに一致するnameが無ければfalseを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
      mockGetDeviceStatus.mockResolvedValue({
        ok: true,
        body: {
          keyList: [
            {
              id: "key-other",
              name: "res-unrelated-name",
              type: "timeLimit",
              password: "enc",
              iv: "iv",
              status: "normal",
              createTime: 1,
            },
          ],
        },
      });

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "success",
      });

      expect(result).toBe(false);
      expect(mockUpdateManyPasscode).not.toHaveBeenCalled();
    });

    test("keyList突合が成功すればCONFIRMEDへ更新しtrueを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
      const expectedName = buildPasscodeName(RESERVATION_ID, DEVICE.id);
      mockGetDeviceStatus.mockResolvedValue({
        ok: true,
        body: {
          keyList: [
            {
              id: "key-1",
              name: expectedName,
              type: "timeLimit",
              password: "enc",
              iv: "iv",
              status: "normal",
              createTime: 1,
            },
          ],
        },
      });
      mockUpdateManyPasscode.mockResolvedValue({ count: 1 });

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "success",
      });

      expect(result).toBe(true);
      expect(mockUpdateManyPasscode).toHaveBeenCalledWith({
        where: { id: PASSCODE_ROW.id, status: "PENDING" },
        data: expect.objectContaining({
          status: "CONFIRMED",
          switchbotKeyId: "key-1",
        }),
      });
    });

    test("突合は成功してもupdateManyがcount:0(先にポーリング側が確定済み)ならfalseを返す", async () => {
      mockFindUniqueDevice.mockResolvedValue(DEVICE);
      mockFindFirstPasscode.mockResolvedValue(PASSCODE_ROW);
      const expectedName = buildPasscodeName(RESERVATION_ID, DEVICE.id);
      mockGetDeviceStatus.mockResolvedValue({
        ok: true,
        body: {
          keyList: [
            {
              id: "key-1",
              name: expectedName,
              type: "timeLimit",
              password: "enc",
              iv: "iv",
              status: "normal",
              createTime: 1,
            },
          ],
        },
      });
      mockUpdateManyPasscode.mockResolvedValue({ count: 0 });

      const result = await processSwitchBotChangeReport({
        deviceMac: DEVICE.deviceId,
        eventName: "createKey",
        commandId: "cmd-1",
        result: "success",
      });

      expect(result).toBe(false);
    });
  });
});
