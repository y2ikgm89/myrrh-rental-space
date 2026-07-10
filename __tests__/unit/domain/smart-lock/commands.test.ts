/**
 * smart-lock/commands.ts のテスト。
 *
 * - setSpaceSmartLockDeviceCommand: デバイスはLocation所有のため、スペースと異なる
 *   拠点のデバイスを割り当てようとした場合に拒否されることを検証する（さもないと
 *   issueSmartLockPasscodesが誤った物理ドアへパスコードを発行してしまう）。
 * - deleteSmartLockDeviceCommand: 削除前に生きたパスコード（PENDING/CONFIRMED）を
 *   revokeし、失敗時は削除をブロックすることを検証する（さもないとcascadeで
 *   keyId対応が失われ、物理ドアのパスコードを二度と失効できなくなる）。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type SpaceRow = { id: string; locationId: string };
type DeviceRow = { id: string; locationId: string };

const mockFindUniqueSpace = mock<
  (...args: unknown[]) => Promise<SpaceRow | null>
>(() => Promise.resolve(null));
const mockFindUniqueDevice = mock<
  (...args: unknown[]) => Promise<DeviceRow | null>
>(() => Promise.resolve(null));
const mockUpdateSpace = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({}),
);

const txStub = {
  $executeRaw: (..._args: unknown[]) => Promise.resolve(undefined),
  space: {
    findUnique: (...args: unknown[]) => mockFindUniqueSpace(...args),
    update: (...args: unknown[]) => mockUpdateSpace(...args),
  },
  smartLockDevice: {
    findUnique: (...args: unknown[]) => mockFindUniqueDevice(...args),
  },
};

const mockFindUniqueDeviceTopLevel = mock<
  (...args: unknown[]) => Promise<{ id: string; deviceId: string } | null>
>(() => Promise.resolve(null));
const mockFindManyPasscodes = mock<
  (
    ...args: unknown[]
  ) => Promise<{ id: string; status: string; switchbotKeyId: string | null }[]>
>(() => Promise.resolve([]));
const mockDeleteDevice = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockGetDecryptedSwitchBotCredentials = mock<
  () => Promise<{
    openToken: string;
    secretKey: string;
    passcodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));
const mockRevokeOne = mock<(...args: unknown[]) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub),
    smartLockDevice: {
      findUnique: (...args: unknown[]) => mockFindUniqueDeviceTopLevel(...args),
      delete: (...args: unknown[]) => mockDeleteDevice(...args),
    },
    smartLockPasscode: {
      findMany: (...args: unknown[]) => mockFindManyPasscodes(...args),
    },
  },
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () =>
    mockGetDecryptedSwitchBotCredentials(),
}));

mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeOne: (...args: unknown[]) => mockRevokeOne(...args),
}));

const { setSpaceSmartLockDeviceCommand, deleteSmartLockDeviceCommand } =
  await import("@/shared/domain/smart-lock/commands");

const SPACE_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const DEVICE_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const LOCATION_A = "loc-a";
const LOCATION_B = "loc-b";

const DEVICE_ROW_ID = "cccccccc-0000-0000-0000-000000000000";
const SWITCHBOT_DEVICE_ID = "AA:BB:CC:DD:EE:FF";
const CREDENTIALS = {
  openToken: "token",
  secretKey: "secret",
  passcodeBufferMinutes: 15,
};

beforeEach(() => {
  mockFindUniqueSpace.mockReset();
  mockFindUniqueDevice.mockReset();
  mockUpdateSpace.mockReset();
  mockUpdateSpace.mockResolvedValue({});

  mockFindUniqueDeviceTopLevel.mockReset();
  mockFindManyPasscodes.mockReset();
  mockDeleteDevice.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockRevokeOne.mockReset();

  mockFindUniqueDeviceTopLevel.mockResolvedValue({
    id: DEVICE_ROW_ID,
    deviceId: SWITCHBOT_DEVICE_ID,
  });
  mockFindManyPasscodes.mockResolvedValue([]);
  mockDeleteDevice.mockResolvedValue({});
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue(CREDENTIALS);
  mockRevokeOne.mockResolvedValue(true);
});

describe("setSpaceSmartLockDeviceCommand", () => {
  test("スペースが見つからない場合はNOT_FOUND", async () => {
    mockFindUniqueSpace.mockResolvedValue(null);

    await expect(
      setSpaceSmartLockDeviceCommand(SPACE_ID, DEVICE_ID),
    ).rejects.toThrow("スペースが見つかりません");
    expect(mockUpdateSpace).not.toHaveBeenCalled();
  });

  test("デバイスが見つからない場合はNOT_FOUND", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      locationId: LOCATION_A,
    });
    mockFindUniqueDevice.mockResolvedValue(null);

    await expect(
      setSpaceSmartLockDeviceCommand(SPACE_ID, DEVICE_ID),
    ).rejects.toThrow("スマートロックデバイスが見つかりません");
    expect(mockUpdateSpace).not.toHaveBeenCalled();
  });

  test("デバイスがスペースと異なる拠点に属する場合は拒否される", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      locationId: LOCATION_A,
    });
    mockFindUniqueDevice.mockResolvedValue({
      id: DEVICE_ID,
      locationId: LOCATION_B,
    });

    await expect(
      setSpaceSmartLockDeviceCommand(SPACE_ID, DEVICE_ID),
    ).rejects.toThrow("このデバイスはスペースと異なる拠点に登録されています");
    expect(mockUpdateSpace).not.toHaveBeenCalled();
  });

  test("同一拠点のデバイスは割り当てが成功する", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      locationId: LOCATION_A,
    });
    mockFindUniqueDevice.mockResolvedValue({
      id: DEVICE_ID,
      locationId: LOCATION_A,
    });

    const result = await setSpaceSmartLockDeviceCommand(SPACE_ID, DEVICE_ID);

    expect(result).toEqual({ id: SPACE_ID, smartLockDeviceId: DEVICE_ID });
    expect(mockUpdateSpace).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SPACE_ID },
        data: { smartLockDeviceId: DEVICE_ID },
      }),
    );
  });

  test("deviceIdにnullを渡すと拠点チェックをせず解除できる", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      locationId: LOCATION_A,
    });

    const result = await setSpaceSmartLockDeviceCommand(SPACE_ID, null);

    expect(result).toEqual({ id: SPACE_ID, smartLockDeviceId: null });
    expect(mockFindUniqueDevice).not.toHaveBeenCalled();
    expect(mockUpdateSpace).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SPACE_ID },
        data: { smartLockDeviceId: null },
      }),
    );
  });
});

describe("deleteSmartLockDeviceCommand", () => {
  test("デバイスが見つからない場合はNOT_FOUND", async () => {
    mockFindUniqueDeviceTopLevel.mockResolvedValue(null);

    await expect(deleteSmartLockDeviceCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "スマートロックデバイスが見つかりません",
    );
    expect(mockDeleteDevice).not.toHaveBeenCalled();
  });

  test("生きたパスコードが無ければそのまま削除できる", async () => {
    mockFindManyPasscodes.mockResolvedValue([]);

    const result = await deleteSmartLockDeviceCommand(DEVICE_ROW_ID);

    expect(result).toEqual({ id: DEVICE_ROW_ID });
    expect(mockDeleteDevice).toHaveBeenCalledWith({
      where: { id: DEVICE_ROW_ID },
    });
  });

  test("PENDINGのパスコードが残っている場合は削除できない", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      { id: "passcode-1", status: "PENDING", switchbotKeyId: null },
    ]);

    await expect(deleteSmartLockDeviceCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "発行処理中のパスコードが残っているため削除できません",
    );
    expect(mockDeleteDevice).not.toHaveBeenCalled();
    expect(mockRevokeOne).not.toHaveBeenCalled();
  });

  test("CONFIRMEDのパスコードは削除前にrevokeされる", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      { id: "passcode-1", status: "CONFIRMED", switchbotKeyId: "key-1" },
    ]);
    mockRevokeOne.mockResolvedValue(true);

    const result = await deleteSmartLockDeviceCommand(DEVICE_ROW_ID);

    expect(result).toEqual({ id: DEVICE_ROW_ID });
    expect(mockRevokeOne).toHaveBeenCalledWith(
      CREDENTIALS,
      expect.objectContaining({
        id: "passcode-1",
        switchbotKeyId: "key-1",
        device: { deviceId: SWITCHBOT_DEVICE_ID },
      }),
    );
    expect(mockDeleteDevice).toHaveBeenCalledWith({
      where: { id: DEVICE_ROW_ID },
    });
  });

  test("SwitchBot連携が無効でrevoke不能な場合は削除をブロックする", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      { id: "passcode-1", status: "CONFIRMED", switchbotKeyId: "key-1" },
    ]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);

    await expect(deleteSmartLockDeviceCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "有効なパスコードが残っているため削除できません",
    );
    expect(mockRevokeOne).not.toHaveBeenCalled();
    expect(mockDeleteDevice).not.toHaveBeenCalled();
  });

  test("revoke失敗時は削除をブロックする", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      { id: "passcode-1", status: "CONFIRMED", switchbotKeyId: "key-1" },
    ]);
    mockRevokeOne.mockResolvedValue(false);

    await expect(deleteSmartLockDeviceCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "一部のパスコードの失効に失敗したため削除できません",
    );
    expect(mockDeleteDevice).not.toHaveBeenCalled();
  });
});
