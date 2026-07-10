/**
 * issueSmartLockPasscodes / buildPasscodeName のテスト
 *
 * Prisma / SwitchBot API クライアント / settings クエリをすべてモックし、
 * ポーリングの `setTimeout` はスパイして即時実行させる（45秒の実待機を回避）。
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { encrypt } from "@/shared/lib/crypto";

// -----------------------------------------------------------------------
// setTimeout スパイ（poll interval を即時解決させる。send.test.ts と同じ手法）
// -----------------------------------------------------------------------
const originalSetTimeout = globalThis.setTimeout;
function runImmediateSetTimeout<TArgs extends unknown[]>(
  handler: (...args: TArgs) => void,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: TArgs
): ReturnType<typeof originalSetTimeout>;
function runImmediateSetTimeout(
  handler: TimerHandler,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: unknown[]
): number;
function runImmediateSetTimeout(
  handler: TimerHandler,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: unknown[]
): number | ReturnType<typeof originalSetTimeout> {
  if (typeof handler === "function") {
    Reflect.apply(handler, undefined, args);
  }
  return originalSetTimeout(() => {}, 0);
}
const immediateSetTimeout = Object.assign(runImmediateSetTimeout, {
  __promisify__: originalSetTimeout.__promisify__,
});
let setTimeoutSpy: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">>;

// -----------------------------------------------------------------------
// モック関数定義（mock.module より前・TDZ 回避）
// -----------------------------------------------------------------------
type DeviceRow = {
  id: string;
  deviceId: string;
  deviceName: string;
  isActive: boolean;
  spaceId: string;
};

const mockFindManyDevices = mock<(...args: unknown[]) => Promise<DeviceRow[]>>(
  () => Promise.resolve([]),
);
const mockCreatePasscodeRow = mock<
  (...args: unknown[]) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "passcode-row-1" }));
const mockUpdatePasscodeRow = mock<(...args: unknown[]) => Promise<unknown>>(
  () => Promise.resolve({}),
);
const mockFindUniquePasscodeRow = mock<
  (...args: unknown[]) => Promise<unknown | null>
>(() => Promise.resolve(null));

const mockGetDecryptedSwitchBotCredentials = mock<
  () => Promise<{
    openToken: string;
    secretKey: string;
    passcodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));

const mockCreatePasscodeApi = mock<
  (
    ...args: unknown[]
  ) => Promise<
    | { ok: true; body: { commandId: string } }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: { commandId: "cmd-default" } }));

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

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockDevice: {
      findMany: (...args: unknown[]) => mockFindManyDevices(...args),
    },
    smartLockPasscode: {
      create: (...args: unknown[]) => mockCreatePasscodeRow(...args),
      update: (...args: unknown[]) => mockUpdatePasscodeRow(...args),
      findUnique: (...args: unknown[]) => mockFindUniquePasscodeRow(...args),
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

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    DATABASE: "DATABASE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

const { issueSmartLockPasscodes, buildPasscodeName } =
  await import("@/shared/domain/smart-lock/issue-passcode");

const RESERVATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const DEVICE_ROW: DeviceRow = {
  id: "11111111-2222-3333-4444-555555555555",
  deviceId: "AA:BB:CC:DD:EE:FF",
  deviceName: "玄関ドア",
  isActive: true,
  spaceId: "space-1",
};
const START_TIME = new Date("2026-08-01T01:00:00.000Z");
const END_TIME = new Date("2026-08-01T03:00:00.000Z");

function makeInput() {
  return {
    reservationId: RESERVATION_ID,
    spaceId: DEVICE_ROW.spaceId,
    startTime: START_TIME,
    endTime: END_TIME,
  };
}

beforeEach(() => {
  setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(
    immediateSetTimeout,
  );

  mockFindManyDevices.mockReset();
  mockCreatePasscodeRow.mockReset();
  mockUpdatePasscodeRow.mockReset();
  mockFindUniquePasscodeRow.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockCreatePasscodeApi.mockReset();
  mockGetDeviceStatus.mockReset();
  mockLogError.mockReset();

  mockFindManyDevices.mockResolvedValue([]);
  mockCreatePasscodeRow.mockResolvedValue({ id: "passcode-row-1" });
  mockUpdatePasscodeRow.mockResolvedValue({});
  mockFindUniquePasscodeRow.mockResolvedValue(null);
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
    openToken: "open-token",
    secretKey: "secret-key",
    passcodeBufferMinutes: 15,
  });
  mockCreatePasscodeApi.mockResolvedValue({
    ok: true,
    body: { commandId: "cmd-default" },
  });
  mockGetDeviceStatus.mockResolvedValue({ ok: true, body: { keyList: [] } });
});

afterEach(() => {
  setTimeoutSpy.mockRestore();
});

describe("buildPasscodeName", () => {
  test("reservationId と deviceRowId の先頭8文字を res-xxx-yyy 形式で連結する", () => {
    expect(
      buildPasscodeName(
        "12345678-abcd-efgh-ijkl-mnopqrstuvwx",
        "87654321-zyxw-vuts-rqpo-nmlkjihgfedc",
      ),
    ).toBe("res-12345678-87654321");
  });

  test("8文字未満のidでも slice(0,8) の結果をそのまま使う", () => {
    expect(buildPasscodeName("short", "id")).toBe("res-short-id");
  });
});

describe("issueSmartLockPasscodes", () => {
  test("対象デバイスが0件の場合はAPI呼出をせず空配列を返す", async () => {
    mockFindManyDevices.mockResolvedValue([]);

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result).toEqual([]);
    expect(mockGetDecryptedSwitchBotCredentials).not.toHaveBeenCalled();
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockGetDeviceStatus).not.toHaveBeenCalled();
  });

  test("SwitchBot連携が未設定(credentials null)の場合はAPI呼出せず空配列を返す", async () => {
    mockFindManyDevices.mockResolvedValue([DEVICE_ROW]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result).toEqual([]);
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("createPasscodeが失敗した場合はDBレコードがFAILEDになり結果に含まれない", async () => {
    mockFindManyDevices.mockResolvedValue([DEVICE_ROW]);
    mockFindUniquePasscodeRow.mockResolvedValue(null);
    mockCreatePasscodeApi.mockResolvedValue({
      ok: false,
      statusCode: 190,
      message: "invalid parameter",
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result).toEqual([]);
    expect(mockGetDeviceStatus).not.toHaveBeenCalled();
    expect(mockUpdatePasscodeRow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "passcode-row-1" },
        data: expect.objectContaining({
          status: "FAILED",
          failureReason: "invalid parameter",
        }),
      }),
    );
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("getDeviceStatusが即座に一致するkeyListエントリを返す場合はCONFIRMEDになり結果に含まれる", async () => {
    mockFindManyDevices.mockResolvedValue([DEVICE_ROW]);
    mockFindUniquePasscodeRow.mockResolvedValue(null);
    mockCreatePasscodeApi.mockResolvedValue({
      ok: true,
      body: { commandId: "cmd-1" },
    });
    const expectedName = buildPasscodeName(RESERVATION_ID, DEVICE_ROW.id);
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
            createTime: 1_700_000_000,
          },
        ],
      },
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result).toHaveLength(1);
    expect(result[0]?.deviceName).toBe(DEVICE_ROW.deviceName);
    expect(result[0]?.passcode).toMatch(/^\d{6}$/);
    expect(mockGetDeviceStatus).toHaveBeenCalledTimes(1);
    expect(mockCreatePasscodeApi).toHaveBeenCalledWith(
      expect.objectContaining({
        openToken: "open-token",
        secretKey: "secret-key",
      }),
      expect.objectContaining({
        deviceId: DEVICE_ROW.deviceId,
        name: expectedName,
        type: "timeLimit",
      }),
    );
    expect(mockUpdatePasscodeRow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "passcode-row-1" },
        data: expect.objectContaining({
          status: "CONFIRMED",
          switchbotKeyId: "key-1",
        }),
      }),
    );
  });

  test("ポーリングが全回数keyListに一致無しで完了する場合はFAILEDになる（タイムアウト）", async () => {
    mockFindManyDevices.mockResolvedValue([DEVICE_ROW]);
    mockFindUniquePasscodeRow.mockResolvedValue(null);
    mockCreatePasscodeApi.mockResolvedValue({
      ok: true,
      body: { commandId: "cmd-1" },
    });
    mockGetDeviceStatus.mockResolvedValue({ ok: true, body: { keyList: [] } });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result).toEqual([]);
    // MAX_POLL_ATTEMPTS = 15 (3s * 15 = 45s、setTimeout はスパイ済みで即時)
    expect(mockGetDeviceStatus).toHaveBeenCalledTimes(15);
    expect(mockUpdatePasscodeRow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "passcode-row-1" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(mockLogError).toHaveBeenCalledTimes(1);
  }, 10_000);

  test("既にCONFIRMEDのレコードがある場合は再度API呼出せず復号して結果に含む", async () => {
    const existingPasscode = encrypt("654321");
    mockFindManyDevices.mockResolvedValue([DEVICE_ROW]);
    mockFindUniquePasscodeRow.mockResolvedValue({
      id: "passcode-existing",
      status: "CONFIRMED",
      passcodeCiphertext: existingPasscode,
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result).toEqual([
      { deviceName: DEVICE_ROW.deviceName, passcode: "654321" },
    ]);
    expect(mockCreatePasscodeRow).not.toHaveBeenCalled();
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockGetDeviceStatus).not.toHaveBeenCalled();
  });

  test("既存レコードがCONFIRMED以外(PENDING等)の場合は何もせず結果から除外する", async () => {
    mockFindManyDevices.mockResolvedValue([DEVICE_ROW]);
    mockFindUniquePasscodeRow.mockResolvedValue({
      id: "passcode-existing",
      status: "PENDING",
      passcodeCiphertext: "irrelevant",
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result).toEqual([]);
    expect(mockCreatePasscodeRow).not.toHaveBeenCalled();
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockGetDeviceStatus).not.toHaveBeenCalled();
  });
});
