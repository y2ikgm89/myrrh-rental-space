/**
 * setSpaceSmartLockDeviceCommand のテスト
 *
 * デバイスはLocation所有のため、スペースと異なる拠点のデバイスを割り当てようとした
 * 場合に拒否されることを検証する（さもないとissueSmartLockPasscodesが誤った
 * 物理ドアへパスコードを発行してしまう）。
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

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub),
  },
}));

const { setSpaceSmartLockDeviceCommand } =
  await import("@/shared/domain/smart-lock/commands");

const SPACE_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const DEVICE_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const LOCATION_A = "loc-a";
const LOCATION_B = "loc-b";

beforeEach(() => {
  mockFindUniqueSpace.mockReset();
  mockFindUniqueDevice.mockReset();
  mockUpdateSpace.mockReset();
  mockUpdateSpace.mockResolvedValue({});
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
