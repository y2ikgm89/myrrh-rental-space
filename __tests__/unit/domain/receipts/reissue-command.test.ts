/**
 * reissueReceiptCommand の unit test (audit finding #5, #13)
 *
 * prisma.$transaction と tx メソッドをすべてモックし、
 * NOT_FOUND / FORBIDDEN / VALIDATION (double-reissue / empty reason) /
 * happy path (revision +1) を検証する。
 *
 * issue.ts は advisory lock・serialNo 採番・issuerSnapshot 取得を tx 内で
 * 完結させるため、tx の各メソッドを個別にモックする。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// -----------------------------------------------------------------------
// tx モック関数（mock.module より前・TDZ 回避）
// -----------------------------------------------------------------------

const mockTxExecuteRaw = mock(() => Promise.resolve(undefined));
const mockTxReceiptFindUnique = mock<(...args: unknown[]) => Promise<unknown>>(
  () => Promise.resolve(null),
);
const mockTxReceiptUpdate = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockTxReceiptCreate = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockTxReceiptSequenceFindUnique = mock<
  (...args: unknown[]) => Promise<unknown>
>(() => Promise.resolve({ id: "singleton", year: 2026, nextNo: 1 }));
const mockTxReceiptSequenceUpsert = mock<
  (...args: unknown[]) => Promise<unknown>
>(() => Promise.resolve({}));
const mockTxSettingsOrganizationFindUnique = mock<
  (...args: unknown[]) => Promise<unknown>
>(() => Promise.resolve(null));

// 実 prisma.$transaction: callback を mock tx で実行するシム
const mockTransaction = mock(
  async (
    callback: (tx: {
      $executeRaw: (...args: unknown[]) => Promise<unknown>;
      receipt: {
        findUnique: (...args: unknown[]) => Promise<unknown>;
        update: (...args: unknown[]) => Promise<unknown>;
        create: (...args: unknown[]) => Promise<unknown>;
      };
      receiptSequence: {
        findUnique: (...args: unknown[]) => Promise<unknown>;
        upsert: (...args: unknown[]) => Promise<unknown>;
      };
      settingsOrganization: {
        findUnique: (...args: unknown[]) => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      $executeRaw: mockTxExecuteRaw,
      receipt: {
        findUnique: (...args: unknown[]) => mockTxReceiptFindUnique(...args),
        update: (...args: unknown[]) => mockTxReceiptUpdate(...args),
        create: (...args: unknown[]) => mockTxReceiptCreate(...args),
      },
      receiptSequence: {
        findUnique: (...args: unknown[]) =>
          mockTxReceiptSequenceFindUnique(...args),
        upsert: (...args: unknown[]) => mockTxReceiptSequenceUpsert(...args),
      },
      settingsOrganization: {
        findUnique: (...args: unknown[]) =>
          mockTxSettingsOrganizationFindUnique(...args),
      },
    }),
);

// -----------------------------------------------------------------------
// モジュールモック（server-only 依存を排除）
// -----------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(callback),
  },
}));

mock.module("@generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class FakePrismaError extends Error {
      readonly code: string;
      constructor(
        message: string,
        options: { code: string; clientVersion?: string },
      ) {
        super(message);
        this.code = options.code;
      }
    },
  },
}));

mock.module("@/shared/db/json", () => ({
  asPrismaInputJsonValue: (value: unknown) => value,
}));

mock.module("@/shared/lib/pricing/rate-breakdown", () => ({
  isLegacyRateBreakdown: () => false,
}));

mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  AuditAction: { CREATE: "CREATE", UPDATE: "UPDATE" },
  PaymentStatus: {
    PAID: "PAID",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    UNPAID: "UNPAID",
    REFUNDED: "REFUNDED",
  },
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: () => undefined,
  ErrorCategory: { DATABASE: "DATABASE", VALIDATION: "VALIDATION" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: () => undefined,
}));

const { reissueReceiptCommand } =
  await import("@/shared/domain/receipts/issue");

// -----------------------------------------------------------------------
// ヘルパー: 正常な original receipt を模倣する最小 fixture
// -----------------------------------------------------------------------

function makeOriginalReceipt(
  overrides: Partial<{
    reservationId: string | null;
    eventRegistrationId: string | null;
  }> = {},
) {
  return {
    id: "receipt-orig-1",
    serialNo: "2026-000001",
    reservationId: "res-1",
    eventRegistrationId: null,
    recipientName: "山田 太郎",
    subject: "スペース利用料として",
    amount: BigInt(5000),
    taxAmount: BigInt(454),
    taxRate: 10,
    revision: 0,
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------

describe("reissueReceiptCommand", () => {
  beforeEach(() => {
    mockTxExecuteRaw.mockReset();
    mockTxReceiptFindUnique.mockReset();
    mockTxReceiptUpdate.mockReset();
    mockTxReceiptCreate.mockReset();
    mockTxReceiptSequenceFindUnique.mockReset();
    mockTxReceiptSequenceUpsert.mockReset();
    mockTxSettingsOrganizationFindUnique.mockReset();
    mockTransaction.mockClear();

    // デフォルト: 採番 / issuerSnapshot の stub
    mockTxExecuteRaw.mockResolvedValue(undefined);
    mockTxReceiptSequenceFindUnique.mockResolvedValue({
      id: "singleton",
      year: 2026,
      nextNo: 99,
    });
    mockTxReceiptSequenceUpsert.mockResolvedValue({});
    mockTxSettingsOrganizationFindUnique.mockResolvedValue(null);
    mockTxReceiptUpdate.mockResolvedValue({});
  });

  // ----------------------------------------------------------------
  // 早期バリデーション (#13)
  // ----------------------------------------------------------------

  test("reason が空文字の場合はトランザクション前に VALIDATION を throw する", async () => {
    let caught: unknown;
    try {
      await reissueReceiptCommand({
        originalReceiptId: "receipt-orig-1",
        reason: "  ",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "VALIDATION" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // NOT_FOUND (#13)
  // ----------------------------------------------------------------

  test("originalReceiptId が存在しない場合は NOT_FOUND を throw する", async () => {
    mockTxReceiptFindUnique.mockResolvedValue(null);

    let caught: unknown;
    try {
      await reissueReceiptCommand({
        originalReceiptId: "nonexistent-id",
        reason: "宛名変更のため",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "NOT_FOUND" });
  });

  // ----------------------------------------------------------------
  // FORBIDDEN: binding mismatch (#5)
  // ----------------------------------------------------------------

  test("expectedReservationId が元 Receipt の reservationId と不一致の場合は FORBIDDEN を throw する", async () => {
    mockTxReceiptFindUnique.mockResolvedValue(
      makeOriginalReceipt({ reservationId: "res-1" }),
    );

    let caught: unknown;
    try {
      await reissueReceiptCommand({
        originalReceiptId: "receipt-orig-1",
        reason: "宛名変更のため",
        expectedReservationId: "res-different", // 不一致
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "FORBIDDEN" });
  });

  test("expectedEventRegistrationId が元 Receipt の eventRegistrationId と不一致の場合は FORBIDDEN を throw する", async () => {
    mockTxReceiptFindUnique.mockResolvedValue(
      makeOriginalReceipt({
        reservationId: null,
        eventRegistrationId: "reg-1",
      }),
    );

    let caught: unknown;
    try {
      await reissueReceiptCommand({
        originalReceiptId: "receipt-orig-1",
        reason: "宛名変更のため",
        expectedEventRegistrationId: "reg-different", // 不一致
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "FORBIDDEN" });
  });

  test("expectedReservationId を指定したのに元 Receipt が eventRegistrationId を持つ場合は FORBIDDEN を throw する", async () => {
    mockTxReceiptFindUnique.mockResolvedValue(
      makeOriginalReceipt({
        reservationId: null,
        eventRegistrationId: "reg-1",
      }),
    );

    let caught: unknown;
    try {
      await reissueReceiptCommand({
        originalReceiptId: "receipt-orig-1",
        reason: "宛名変更のため",
        expectedReservationId: "res-1",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "FORBIDDEN" });
  });

  // ----------------------------------------------------------------
  // VALIDATION: double reissue (#5)
  // ----------------------------------------------------------------

  test("reservationId / eventRegistrationId が共に null の orphan Receipt を base にした再発行は VALIDATION を throw する", async () => {
    mockTxReceiptFindUnique.mockResolvedValue(
      makeOriginalReceipt({ reservationId: null, eventRegistrationId: null }),
    );

    let caught: unknown;
    try {
      await reissueReceiptCommand({
        originalReceiptId: "receipt-orig-1",
        reason: "訂正のため",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "VALIDATION" });
  });

  // ----------------------------------------------------------------
  // Happy path (#5)
  // ----------------------------------------------------------------

  test("正常再発行時は新 Receipt が revision +1 で create され、元 Receipt の reservationId が null に update される", async () => {
    const original = makeOriginalReceipt(); // revision: 0, reservationId: "res-1"
    mockTxReceiptFindUnique.mockResolvedValue(original);
    const newReceipt = {
      id: "receipt-new-1",
      serialNo: "2026-000099",
      reservationId: "res-1",
      revision: 1,
    };
    mockTxReceiptCreate.mockResolvedValue(newReceipt);

    const result = await reissueReceiptCommand({
      originalReceiptId: "receipt-orig-1",
      reason: "宛名を会社名に変更",
    });

    // 元 Receipt を orphan 化
    expect(mockTxReceiptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "receipt-orig-1" },
        data: { reservationId: null, eventRegistrationId: null },
      }),
    );

    // 新 Receipt を reservationId 付きで create
    expect(mockTxReceiptCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reservationId: "res-1",
          reissuedFromId: "receipt-orig-1",
          reissuedReason: "宛名を会社名に変更",
          revision: 1, // original.revision + 1
        }),
      }),
    );

    // 返り値は新 Receipt (id で同一性を確認)
    expect(result.id).toBe(newReceipt.id);
  });

  test("eventRegistrationId を持つ Receipt を再発行するとき新 Receipt に eventRegistrationId が引き継がれる", async () => {
    const original = makeOriginalReceipt({
      reservationId: null,
      eventRegistrationId: "reg-1",
    });
    mockTxReceiptFindUnique.mockResolvedValue({ ...original, revision: 2 });
    const newReceipt = { id: "receipt-new-ev-1", revision: 3 };
    mockTxReceiptCreate.mockResolvedValue(newReceipt);

    await reissueReceiptCommand({
      originalReceiptId: "receipt-orig-1",
      reason: "イベント申込の訂正版",
      expectedEventRegistrationId: "reg-1",
    });

    expect(mockTxReceiptCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventRegistrationId: "reg-1",
          revision: 3,
        }),
      }),
    );
    // reservationId は含まない
    const createCall = mockTxReceiptCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createCall?.data).not.toHaveProperty("reservationId");
  });

  test("binding check なし (expectedReservationId 未指定) でも正常に再発行できる", async () => {
    mockTxReceiptFindUnique.mockResolvedValue(makeOriginalReceipt());
    const newReceipt = { id: "receipt-new-2", revision: 1 };
    mockTxReceiptCreate.mockResolvedValue(newReceipt);

    const result = await reissueReceiptCommand({
      originalReceiptId: "receipt-orig-1",
      reason: "訂正のため",
    });
    expect(result.id).toBe(newReceipt.id);
  });
});
