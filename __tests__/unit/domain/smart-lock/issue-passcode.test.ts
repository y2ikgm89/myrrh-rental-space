/**
 * issueSmartLockPasscodes / buildPasscodeName のテスト
 *
 * Prisma / SwitchBot API クライアント / settings クエリをすべてモックし、
 * ポーリングの `setTimeout` はスパイして即時実行させる（45秒の実待機を回避）。
 *
 * SmartLockDeviceはLocation所有・Spaceは`smartLockDeviceId`で単一デバイスを参照する
 * モデルのため、`prisma.space.findUnique({select:{smartLockDevice:true}})`をモックする。
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
import { PASSCODE_CRYPTO_PURPOSE } from "@/shared/domain/smart-lock/issue-passcode";

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
};

const mockFindUniqueSpace = mock<
  (...args: unknown[]) => Promise<{ smartLockDevice: DeviceRow | null } | null>
>(() => Promise.resolve({ smartLockDevice: null }));
const mockCreatePasscodeRow = mock<
  (...args: unknown[]) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "passcode-row-1" }));
const mockUpdatePasscodeRow = mock<(...args: unknown[]) => Promise<unknown>>(
  () => Promise.resolve({}),
);
const mockUpdateManyPasscodeRow = mock<
  (...args: unknown[]) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
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

class FakePrismaKnownRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

mock.module("@generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: FakePrismaKnownRequestError,
  },
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findUnique: (...args: unknown[]) => mockFindUniqueSpace(...args),
    },
    smartLockPasscode: {
      create: (...args: unknown[]) => mockCreatePasscodeRow(...args),
      update: (...args: unknown[]) => mockUpdatePasscodeRow(...args),
      updateMany: (...args: unknown[]) => mockUpdateManyPasscodeRow(...args),
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
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
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

// PR#11 で issue-passcode.ts に追加された admin 通知発火経路をモックする。
// 実装は fireAndForget(createNotificationCommand(...)) で発火するが、
// createNotificationCommand は prisma.adminNotification.create を呼ぶため、
// 未モックだと fireAndForget が catch して logError を追加で呼び出し、
// 既存 test の toHaveBeenCalledTimes(1) 期待値を狂わせる。
const mockCreateNotificationCommand = mock<
  (...args: unknown[]) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (...args: unknown[]) =>
    mockCreateNotificationCommand(...args),
}));

const { issueSmartLockPasscodes, buildPasscodeName } =
  await import("@/shared/domain/smart-lock/issue-passcode");

const RESERVATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SPACE_ID = "space-1";
const DEVICE_ROW: DeviceRow = {
  id: "11111111-2222-3333-4444-555555555555",
  deviceId: "AA:BB:CC:DD:EE:FF",
  deviceName: "玄関ドア",
  isActive: true,
};
const START_TIME = new Date("2026-08-01T01:00:00.000Z");
const END_TIME = new Date("2026-08-01T03:00:00.000Z");

function makeInput() {
  return {
    reservationId: RESERVATION_ID,
    spaceId: SPACE_ID,
    startTime: START_TIME,
    endTime: END_TIME,
  };
}

beforeEach(() => {
  setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(
    immediateSetTimeout,
  );

  mockFindUniqueSpace.mockReset();
  mockCreatePasscodeRow.mockReset();
  mockUpdatePasscodeRow.mockReset();
  mockUpdateManyPasscodeRow.mockReset();
  mockFindUniquePasscodeRow.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockCreatePasscodeApi.mockReset();
  mockGetDeviceStatus.mockReset();
  mockLogError.mockReset();

  mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: null });
  mockCreatePasscodeRow.mockResolvedValue({ id: "passcode-row-1" });
  mockUpdatePasscodeRow.mockResolvedValue({});
  mockUpdateManyPasscodeRow.mockResolvedValue({ count: 1 });
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
  test("reservationId と deviceRowId のハイフンを除いた先頭16文字を res-xxx-yyy 形式で連結する", () => {
    expect(
      buildPasscodeName(
        "12345678-abcd-4efg-8hij-klmnopqrstuv",
        "87654321-zyxw-4vut-8srq-ponmlkjihgfe",
      ),
    ).toBe("res-12345678abcd4efg-87654321zyxw4vut");
  });

  test("16文字未満のidでも除去・切詰め後の結果をそのまま使う", () => {
    expect(buildPasscodeName("short", "id")).toBe("res-short-id");
  });
});

describe("issueSmartLockPasscodes", () => {
  test("スペースにデバイス未割り当ての場合はAPI呼出をせず空配列を返す", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: null });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
    expect(mockGetDecryptedSwitchBotCredentials).not.toHaveBeenCalled();
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockGetDeviceStatus).not.toHaveBeenCalled();
  });

  test("割り当てられたデバイスが無効化されている場合はAPI呼出をせず空配列を返す", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      smartLockDevice: { ...DEVICE_ROW, isActive: false },
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
    expect(mockGetDecryptedSwitchBotCredentials).not.toHaveBeenCalled();
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
  });

  test("SwitchBot連携が未設定(credentials null)の場合はAPI呼出せず空配列を返す", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("createPasscodeが失敗した場合はDBレコードがFAILEDになり結果に含まれない", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
    mockFindUniquePasscodeRow.mockResolvedValue(null);
    mockCreatePasscodeApi.mockResolvedValue({
      ok: false,
      statusCode: 190,
      message: "invalid parameter",
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
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
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
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

    expect(result.passcodes).toHaveLength(1);
    expect(result.passcodes[0]?.deviceName).toBe(DEVICE_ROW.deviceName);
    expect(result.passcodes[0]?.passcode).toMatch(/^\d{6}$/);
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
    expect(mockUpdateManyPasscodeRow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "passcode-row-1", status: "PENDING" },
        data: expect.objectContaining({
          status: "CONFIRMED",
          switchbotKeyId: "key-1",
        }),
      }),
    );
  });

  test("確定writeがwebhookと競合(count=0)しても既にCONFIRMED済みならpasscodeを返す", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
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
    mockUpdateManyPasscodeRow.mockResolvedValue({ count: 0 });
    mockFindUniquePasscodeRow.mockImplementation((...args: unknown[]) => {
      const arg = args[0] as { select?: { status?: boolean } } | undefined;
      if (arg?.select?.status) {
        return Promise.resolve({ status: "CONFIRMED" });
      }
      return Promise.resolve(null);
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toHaveLength(1);
    expect(result.passcodes[0]?.passcode).toMatch(/^\d{6}$/);
  });

  test("確定writeがwebhookと競合(count=0)しFAILED済みならnullを返す(結果に含めない)", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
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
    mockUpdateManyPasscodeRow.mockResolvedValue({ count: 0 });
    mockFindUniquePasscodeRow.mockImplementation((...args: unknown[]) => {
      const arg = args[0] as { select?: { status?: boolean } } | undefined;
      if (arg?.select?.status) {
        return Promise.resolve({ status: "FAILED" });
      }
      return Promise.resolve(null);
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
  });

  test("ポーリングタイムアウト時は status を PENDING のまま残し、警告ログのみ出す (webhook 到着余地を保つ)", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
    mockFindUniquePasscodeRow.mockResolvedValue(null);
    mockCreatePasscodeApi.mockResolvedValue({
      ok: true,
      body: { commandId: "cmd-1" },
    });
    mockGetDeviceStatus.mockResolvedValue({ ok: true, body: { keyList: [] } });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
    // MAX_POLL_ATTEMPTS = 15 (3s * 15 = 45s、setTimeout はスパイ済みで即時)
    expect(mockGetDeviceStatus).toHaveBeenCalledTimes(15);

    // ポーリングタイムアウト時に FAILED へは倒さない —
    // webhook-commands.ts の processSwitchBotChangeReport が status=PENDING の
    // 行しか claim できないため、即 FAILED は遅延 webhook との race で復旧不能の
    // 失敗確定を生む。stale PENDING の清算は smart-lock-cleanup cron の
    // expireStalePendingSmartLockPasscodes に委譲。
    const failedUpdateCalls = mockUpdatePasscodeRow.mock.calls.filter(
      (call) => {
        const args = call[0] as { data?: { status?: string } } | undefined;
        return args?.data?.status === "FAILED";
      },
    );
    expect(failedUpdateCalls).toHaveLength(0);

    // 警告ログは残す (運用者が Cloud Logging から検知して個別対応する導線)
    expect(mockLogError).toHaveBeenCalledTimes(1);
  }, 10_000);

  test("既にCONFIRMEDのレコードがある場合は再度API呼出せず復号して結果に含む", async () => {
    const existingPasscode = encrypt("654321", {
      purpose: PASSCODE_CRYPTO_PURPOSE,
    });
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
    mockFindUniquePasscodeRow.mockResolvedValue({
      id: "passcode-existing",
      status: "CONFIRMED",
      passcodeCiphertext: existingPasscode,
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([
      { deviceName: DEVICE_ROW.deviceName, passcode: "654321" },
    ]);
    expect(mockCreatePasscodeRow).not.toHaveBeenCalled();
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockGetDeviceStatus).not.toHaveBeenCalled();
  });

  test("既存CONFIRMEDレコードの復号に失敗した場合は例外を投げず空配列を返す", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
    mockFindUniquePasscodeRow.mockResolvedValue({
      id: "passcode-existing",
      status: "CONFIRMED",
      passcodeCiphertext: "corrupted-not-a-real-ciphertext",
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
    expect(mockLogError).toHaveBeenCalled();
  });

  test("既存レコードがCONFIRMED以外(PENDING等)の場合は何もせず結果から除外する", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
    mockFindUniquePasscodeRow.mockResolvedValue({
      id: "passcode-existing",
      status: "PENDING",
      passcodeCiphertext: "irrelevant",
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
    expect(mockCreatePasscodeRow).not.toHaveBeenCalled();
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
    expect(mockGetDeviceStatus).not.toHaveBeenCalled();
  });

  test("createでの一意制約違反(P2002)は既存の先勝ちCONFIRMED行を読み直して返す(例外を投げない)", async () => {
    mockFindUniqueSpace.mockResolvedValue({ smartLockDevice: DEVICE_ROW });
    // 初回のdedupe checkはnull(まだ存在しない)、create()がP2002で失敗した後の
    // リカバリ用findUniqueで先勝ち行を返す。
    let callCount = 0;
    mockFindUniquePasscodeRow.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve(null);
      return Promise.resolve({
        id: "passcode-winner",
        status: "CONFIRMED",
        passcodeCiphertext: encrypt("111222", {
          purpose: PASSCODE_CRYPTO_PURPOSE,
        }),
      });
    });
    mockCreatePasscodeRow.mockImplementation(() => {
      throw new FakePrismaKnownRequestError(
        "Unique constraint failed",
        "P2002",
      );
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([
      { deviceName: DEVICE_ROW.deviceName, passcode: "111222" },
    ]);
    expect(mockCreatePasscodeApi).not.toHaveBeenCalled();
  });

  test("想定外の例外(DB障害等)が起きても投げずに空配列を返す(呼び出し元のメール送信をブロックしない)", async () => {
    mockFindUniqueSpace.mockImplementation(() => {
      throw new Error("connection terminated unexpectedly");
    });

    const result = await issueSmartLockPasscodes(makeInput());

    expect(result.passcodes).toEqual([]);
    expect(mockLogError).toHaveBeenCalled();
  });
});
