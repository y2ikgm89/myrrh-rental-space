/**
 * smart-lock/commands.ts のテスト。
 *
 * - setSpaceSmartLockDeviceCommand: デバイスはLocation所有のため、スペースと異なる
 *   拠点のデバイスを割り当てようとした場合に拒否されることを検証する（さもないと
 *   issueSmartLockPasscodesが誤った物理ドアへパスコードを発行してしまう）。
 * - deleteSmartLockDeviceCommand: 削除前に生きたパスコード（PENDING/CONFIRMED/REVOKE_PENDING）を
 *   revokeし、失敗時は削除をブロックすることを検証する（さもないとcascadeで
 *   keyId対応が失われ、物理ドアのパスコードを二度と失効できなくなる）。
 * - create/update/refresh: 錠タイプ・ペアリンク・pad-only 割当の検証。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";

type SpaceRow = { id: string; locationId: string };
type DeviceRow = {
  id: string;
  locationId: string;
  deviceType?: string;
};

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

const mockFindUniqueLocation = mock<
  (...args: unknown[]) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));
const mockUpdateLocation = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockFindUniqueDeviceTopLevel = mock<
  (...args: unknown[]) => Promise<{
    id: string;
    deviceId: string;
    locationId?: string;
    deviceType?: string;
  } | null>
>(() => Promise.resolve(null));
const mockFindFirstDevice = mock<
  (...args: unknown[]) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));
const mockCreateDevice = mock<(...args: unknown[]) => Promise<{ id: string }>>(
  () => Promise.resolve({ id: "new-device-id" }),
);
const mockUpdateDevice = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
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
const mockGetDeviceListCached = mock<
  () => Promise<{
    ok: true;
    body: {
      deviceList: {
        deviceId: string;
        lockDeviceId?: string;
      }[];
      infraredRemoteList: unknown[];
    };
  }>
>(() =>
  Promise.resolve({
    ok: true,
    body: { deviceList: [], infraredRemoteList: [] },
  }),
);
const mockGetLockDeviceStatus = mock<
  () => Promise<{
    ok: true;
    body: { lockState?: string; doorState?: string; battery?: number };
  }>
>(() =>
  Promise.resolve({
    ok: true,
    body: {
      lockState: "locked",
      doorState: "close",
      battery: 88,
    },
  }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub),
    location: {
      findUnique: (...args: unknown[]) => mockFindUniqueLocation(...args),
      update: (...args: unknown[]) => mockUpdateLocation(...args),
    },
    smartLockDevice: {
      findUnique: (...args: unknown[]) => mockFindUniqueDeviceTopLevel(...args),
      findFirst: (...args: unknown[]) => mockFindFirstDevice(...args),
      create: (...args: unknown[]) => mockCreateDevice(...args),
      update: (...args: unknown[]) => mockUpdateDevice(...args),
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

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  getDeviceListCached: () => mockGetDeviceListCached(),
  getLockDeviceStatus: () => mockGetLockDeviceStatus(),
}));

const {
  setSpaceSmartLockDeviceCommand,
  setLocationDefaultSmartLockDeviceCommand,
  deleteSmartLockDeviceCommand,
  createSmartLockDeviceCommand,
  updateSmartLockDeviceCommand,
  refreshLockDeviceStateCommand,
} = await import("@/shared/domain/smart-lock/commands");

const SPACE_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const DEVICE_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const LOCATION_A = "loc-a";
const LOCATION_B = "loc-b";

const DEVICE_ROW_ID = "cccccccc-0000-0000-0000-000000000000";
const PAIRED_LOCK_ID = "dddddddd-0000-0000-0000-000000000000";
const SWITCHBOT_DEVICE_ID = "AA:BB:CC:DD:EE:FF";
const SWITCHBOT_LOCK_ID = "11:22:33:44:55:66";
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
  mockFindUniqueLocation.mockReset();
  mockUpdateLocation.mockReset();

  mockFindUniqueDeviceTopLevel.mockReset();
  mockFindFirstDevice.mockReset();
  mockCreateDevice.mockReset();
  mockUpdateDevice.mockReset();
  mockFindManyPasscodes.mockReset();
  mockDeleteDevice.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockRevokeOne.mockReset();
  mockGetDeviceListCached.mockReset();
  mockGetLockDeviceStatus.mockReset();

  mockFindUniqueDeviceTopLevel.mockResolvedValue({
    id: DEVICE_ROW_ID,
    deviceId: SWITCHBOT_DEVICE_ID,
    locationId: LOCATION_A,
    deviceType: SmartLockDeviceType.LOCK_PRO,
  });
  mockFindManyPasscodes.mockResolvedValue([]);
  mockDeleteDevice.mockResolvedValue({});
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue(CREDENTIALS);
  mockRevokeOne.mockResolvedValue(true);
  mockFindUniqueLocation.mockResolvedValue({ id: LOCATION_A });
  mockCreateDevice.mockResolvedValue({ id: "new-device-id" });
  mockGetDeviceListCached.mockResolvedValue({
    ok: true,
    body: { deviceList: [], infraredRemoteList: [] },
  });
  mockGetLockDeviceStatus.mockResolvedValue({
    ok: true,
    body: {
      lockState: "locked",
      doorState: "close",
      battery: 88,
    },
  });
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
      deviceType: SmartLockDeviceType.KEYPAD,
    });

    await expect(
      setSpaceSmartLockDeviceCommand(SPACE_ID, DEVICE_ID),
    ).rejects.toThrow("このデバイスはスペースと異なる拠点に登録されています");
    expect(mockUpdateSpace).not.toHaveBeenCalled();
  });

  test("錠タイプのデバイスはスペース割当を拒否される", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      locationId: LOCATION_A,
    });
    mockFindUniqueDevice.mockResolvedValue({
      id: DEVICE_ID,
      locationId: LOCATION_A,
      deviceType: SmartLockDeviceType.LOCK_PRO,
    });

    await expect(
      setSpaceSmartLockDeviceCommand(SPACE_ID, DEVICE_ID),
    ).rejects.toThrow("Keypad 系デバイスのみ");
    expect(mockUpdateSpace).not.toHaveBeenCalled();
  });

  test("同一拠点のパッドは割り当てが成功する", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      locationId: LOCATION_A,
    });
    mockFindUniqueDevice.mockResolvedValue({
      id: DEVICE_ID,
      locationId: LOCATION_A,
      deviceType: SmartLockDeviceType.KEYPAD_TOUCH,
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

describe("setLocationDefaultSmartLockDeviceCommand", () => {
  test("錠タイプのデバイスは拠点既定割当を拒否される", async () => {
    mockFindUniqueLocation.mockResolvedValue({ id: LOCATION_A });
    mockFindUniqueDeviceTopLevel.mockResolvedValue({
      id: DEVICE_ID,
      deviceId: SWITCHBOT_DEVICE_ID,
      locationId: LOCATION_A,
      deviceType: SmartLockDeviceType.LOCK,
    });

    await expect(
      setLocationDefaultSmartLockDeviceCommand(LOCATION_A, DEVICE_ID),
    ).rejects.toThrow("Keypad 系デバイスのみ");
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });
});

describe("createSmartLockDeviceCommand", () => {
  test("錠タイプのデバイスを作成できる", async () => {
    mockFindUniqueLocation.mockResolvedValue({ id: LOCATION_A });

    const result = await createSmartLockDeviceCommand(LOCATION_A, {
      deviceId: SWITCHBOT_LOCK_ID,
      deviceName: "玄関 Lock Pro",
      deviceType: SmartLockDeviceType.LOCK_PRO,
      isActive: true,
    });

    expect(result).toEqual({ id: "new-device-id" });
    expect(mockCreateDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceType: SmartLockDeviceType.LOCK_PRO,
          pairedLockDeviceId: null,
        }),
      }),
    );
  });

  test("パッド作成時に Device List の lockDeviceId から自動リンクする", async () => {
    mockFindUniqueLocation.mockResolvedValue({ id: LOCATION_A });
    mockGetDeviceListCached.mockResolvedValue({
      ok: true,
      body: {
        deviceList: [
          {
            deviceId: SWITCHBOT_DEVICE_ID,
            lockDeviceId: SWITCHBOT_LOCK_ID,
          },
        ],
        infraredRemoteList: [],
      },
    });
    mockFindFirstDevice.mockResolvedValue({ id: PAIRED_LOCK_ID });

    await createSmartLockDeviceCommand(LOCATION_A, {
      deviceId: SWITCHBOT_DEVICE_ID,
      deviceName: "玄関 Keypad",
      deviceType: SmartLockDeviceType.KEYPAD,
      isActive: true,
    });

    expect(mockCreateDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pairedLockDeviceId: PAIRED_LOCK_ID,
        }),
      }),
    );
  });

  test("ペア錠が別拠点の場合は拒否される", async () => {
    mockFindUniqueLocation.mockResolvedValue({ id: LOCATION_A });
    mockFindUniqueDeviceTopLevel.mockResolvedValue({
      id: PAIRED_LOCK_ID,
      deviceId: SWITCHBOT_LOCK_ID,
      locationId: LOCATION_B,
      deviceType: SmartLockDeviceType.LOCK_PRO,
    });

    await expect(
      createSmartLockDeviceCommand(LOCATION_A, {
        deviceId: SWITCHBOT_DEVICE_ID,
        deviceName: "玄関 Keypad",
        deviceType: SmartLockDeviceType.KEYPAD,
        isActive: true,
        pairedLockDeviceId: PAIRED_LOCK_ID,
      }),
    ).rejects.toThrow("同じ拠点");
    expect(mockCreateDevice).not.toHaveBeenCalled();
  });
});

describe("updateSmartLockDeviceCommand", () => {
  test("錠デバイスにペア錠を設定しようとすると拒否される", async () => {
    mockFindUniqueDeviceTopLevel.mockResolvedValue({
      id: DEVICE_ROW_ID,
      deviceId: SWITCHBOT_LOCK_ID,
      locationId: LOCATION_A,
    });

    await expect(
      updateSmartLockDeviceCommand(DEVICE_ROW_ID, {
        deviceId: SWITCHBOT_LOCK_ID,
        deviceName: "玄関 Lock",
        deviceType: SmartLockDeviceType.LOCK,
        isActive: true,
        pairedLockDeviceId: PAIRED_LOCK_ID,
      }),
    ).rejects.toThrow("錠デバイスにはペア錠を設定できません");
    expect(mockUpdateDevice).not.toHaveBeenCalled();
  });
});

describe("refreshLockDeviceStateCommand", () => {
  test("錠デバイスの状態を正規化して保存する", async () => {
    mockFindUniqueDeviceTopLevel.mockResolvedValue({
      id: DEVICE_ROW_ID,
      deviceId: SWITCHBOT_LOCK_ID,
      deviceType: SmartLockDeviceType.LOCK_PRO,
    });

    const result = await refreshLockDeviceStateCommand(DEVICE_ROW_ID);

    expect(result.lastLockState).toBe("LOCKED");
    expect(result.lastDoorState).toBe("CLOSE");
    expect(result.lastBattery).toBe(88);
    expect(mockUpdateDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEVICE_ROW_ID },
        data: expect.objectContaining({
          lastLockState: "LOCKED",
          lastDoorState: "CLOSE",
          lastBattery: 88,
        }),
      }),
    );
  });

  test("Lock Lite は doorState を保存しない", async () => {
    mockFindUniqueDeviceTopLevel.mockResolvedValue({
      id: DEVICE_ROW_ID,
      deviceId: SWITCHBOT_LOCK_ID,
      deviceType: SmartLockDeviceType.LOCK_LITE,
    });
    mockGetLockDeviceStatus.mockResolvedValue({
      ok: true,
      body: {
        lockState: "UNLOCKED",
        doorState: "open",
        battery: 50,
      },
    });

    const result = await refreshLockDeviceStateCommand(DEVICE_ROW_ID);

    expect(result.lastLockState).toBe("UNLOCKED");
    expect(result.lastDoorState).toBeNull();
    expect(mockUpdateDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastDoorState: null,
        }),
      }),
    );
  });

  test("パッドデバイスへの refresh は拒否される", async () => {
    mockFindUniqueDeviceTopLevel.mockResolvedValue({
      id: DEVICE_ROW_ID,
      deviceId: SWITCHBOT_DEVICE_ID,
      deviceType: SmartLockDeviceType.KEYPAD,
    });

    await expect(refreshLockDeviceStateCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "Lock / Lock Lite / Lock Pro のみ",
    );
    expect(mockGetLockDeviceStatus).not.toHaveBeenCalled();
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
    mockFindManyPasscodes.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await deleteSmartLockDeviceCommand(DEVICE_ROW_ID);

    expect(result).toEqual({ id: DEVICE_ROW_ID });
    expect(mockDeleteDevice).toHaveBeenCalledWith({
      where: { id: DEVICE_ROW_ID },
    });
  });

  test("PENDINGのパスコードが残っている場合は削除できない", async () => {
    mockFindManyPasscodes.mockResolvedValueOnce([
      { id: "passcode-1", status: "PENDING", switchbotKeyId: null },
    ]);

    await expect(deleteSmartLockDeviceCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "発行処理中のパスコードが残っているため削除できません",
    );
    expect(mockDeleteDevice).not.toHaveBeenCalled();
    expect(mockRevokeOne).not.toHaveBeenCalled();
  });

  test("REVOKE_PENDINGのパスコードが残っている場合は削除できない", async () => {
    mockFindManyPasscodes.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "passcode-1",
        status: "REVOKE_PENDING",
        switchbotKeyId: "key-1",
      },
    ]);

    await expect(deleteSmartLockDeviceCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "失効処理中のパスコードが残っているため削除できません",
    );
    expect(mockRevokeOne).not.toHaveBeenCalled();
    expect(mockDeleteDevice).not.toHaveBeenCalled();
  });

  test("CONFIRMEDのパスコードは削除前にrevokeされる", async () => {
    mockFindManyPasscodes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
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
    mockFindManyPasscodes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
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
    mockFindManyPasscodes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "passcode-1", status: "CONFIRMED", switchbotKeyId: "key-1" },
      ]);
    mockRevokeOne.mockResolvedValue(false);

    await expect(deleteSmartLockDeviceCommand(DEVICE_ROW_ID)).rejects.toThrow(
      "一部のパスコードの失効に失敗したため削除できません",
    );
    expect(mockDeleteDevice).not.toHaveBeenCalled();
  });
});
