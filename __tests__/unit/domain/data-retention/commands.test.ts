import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  parseDataRetentionConfig,
  DEFAULT_DATA_RETENTION_CONFIG,
} from "@/shared/lib/json-validators";
import { ANONYMIZED_CUSTOMER_FIELDS } from "@/shared/lib/constants/anonymized-customer-fields";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";

// Prisma を mock で切り離す。domain 関数が呼び出す method の contract を interface で満たす。
// mock 関数は WHERE 節を capture するため、args を pass-through で受け取る。

type DeleteManyResult = { count: number };
type MockArgs = Record<string, unknown> | undefined;

const mockSessionDeleteMany = mock<
  (args?: MockArgs) => Promise<DeleteManyResult>
>(() => Promise.resolve({ count: 0 }));
const mockVerificationDeleteMany = mock<
  (args?: MockArgs) => Promise<DeleteManyResult>
>(() => Promise.resolve({ count: 0 }));
const mockReservationUpdateMany = mock<
  (args?: MockArgs) => Promise<DeleteManyResult>
>(() => Promise.resolve({ count: 0 }));
const mockInquiryDeleteMany = mock<
  (args?: MockArgs) => Promise<DeleteManyResult>
>(() => Promise.resolve({ count: 0 }));
const mockInquiryAttachmentFindMany = mock<
  (args?: MockArgs) => Promise<Array<{ r2Key: string }>>
>(() => Promise.resolve([]));
const mockCustomerFindMany = mock<
  (args?: MockArgs) => Promise<Array<{ id: string }>>
>(() => Promise.resolve([]));
const mockCustomerUpdate = mock<
  (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{
    id: string;
  }>
>((args) => Promise.resolve({ id: args.where.id }));
const mockExecuteRaw = mock<() => Promise<number>>(() => Promise.resolve(0));

const txClient = {
  $executeRaw: mockExecuteRaw,
  inquiry: {
    deleteMany: (args?: MockArgs) => mockInquiryDeleteMany(args),
  },
};

const mockTransaction = mock<
  (fn: (tx: typeof txClient) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClient));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    session: { deleteMany: (args?: MockArgs) => mockSessionDeleteMany(args) },
    verification: {
      deleteMany: (args?: MockArgs) => mockVerificationDeleteMany(args),
    },
    reservation: {
      updateMany: (args?: MockArgs) => mockReservationUpdateMany(args),
    },
    inquiryAttachment: {
      findMany: (args?: MockArgs) => mockInquiryAttachmentFindMany(args),
    },
    customer: {
      findMany: (args?: MockArgs) => mockCustomerFindMany(args),
      update: (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => mockCustomerUpdate(args),
    },
    settingsDataRetention: { findUnique: mock() },
    $transaction: mockTransaction,
  },
}));

const mockGetR2InquiriesBucketName = mock<() => string>(
  () => "test-inquiries-bucket",
);
mock.module("@/shared/lib/r2/client", () => ({
  getR2InquiriesBucketName: () => mockGetR2InquiriesBucketName(),
}));

const mockDeleteObjectsFromBucket = mock<
  (bucket: string, keys: string[]) => Promise<{ success: boolean }>
>(() => Promise.resolve({ success: true }));
mock.module("@/shared/lib/r2/delete", () => ({
  deleteObjectsFromBucket: (bucket: string, keys: string[]) =>
    mockDeleteObjectsFromBucket(bucket, keys),
}));

// 匿名化の実装は 1 本（`anonymizeCustomerCommand`）。ここでは「委譲していること」
// だけを見る。何が消えるかは
// `__tests__/integration/domain/customers/anonymize-covers-pii.test.ts` が実 DB で確かめる。
type AnonymizeCustomerResult = {
  customerId: string;
  anonymizedAt: Date;
  reason: string;
  hadUserId: boolean;
  preservedSuppression: boolean;
  anonymizedInquiryIds: string[];
};

const ANONYMIZED_AT = new Date("2027-01-15T12:00:00.000Z");

function anonymizeCustomerResult(
  customerId: string,
  overrides: Partial<AnonymizeCustomerResult> = {},
): AnonymizeCustomerResult {
  return {
    customerId,
    anonymizedAt: ANONYMIZED_AT,
    reason: "data-retention",
    hadUserId: true,
    preservedSuppression: false,
    anonymizedInquiryIds: [`inq-${customerId}`],
    ...overrides,
  };
}

const mockAnonymizeCustomerCommand = mock<
  (input: {
    customerId: string;
    reason: string;
  }) => Promise<AnonymizeCustomerResult>
>((input) => Promise.resolve(anonymizeCustomerResult(input.customerId)));

mock.module("@/shared/domain/customers/customer-lifecycle-commands", () => ({
  anonymizeCustomerCommand: mockAnonymizeCustomerCommand,
}));

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const actualAuditLogCommands =
  await import("@/shared/domain/audit-log/commands");
mock.module("@/shared/domain/audit-log/commands", () => ({
  ...actualAuditLogCommands,
  createAuditLogRecord: mockCreateAuditLogRecord,
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => {}),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API", DATABASE: "DATABASE" },
  ErrorSeverity: { HIGH: "HIGH", MEDIUM: "MEDIUM" },
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

const {
  purgeExpiredSessions,
  purgeExpiredVerifications,
  anonymizeExpiredGuestReservations,
  purgeExpiredInquiries,
  anonymizeInactiveCustomers,
  runDataRetentionPurge,
} = await import("@/shared/domain/data-retention/commands");

const { DomainError } = await import("@/shared/domain/domain-error");

const NOW = new Date("2027-01-15T00:00:00Z");

describe("parseDataRetentionConfig", () => {
  test("完全な JSON はそのまま parse される", () => {
    const input = {
      sessionMonths: 3,
      verificationMonths: 3,
      reservationGuestMonths: 6,
      inquiryMonths: 12,
      customerInactiveMonths: 60,
    };
    expect(parseDataRetentionConfig(input)).toEqual(input);
  });

  test("欠損キーがあると DEFAULT にフォールバック（silent 部分適用しない）", () => {
    // sessionMonths だけ落ちている
    const input = {
      verificationMonths: 3,
      reservationGuestMonths: 6,
      inquiryMonths: 12,
      customerInactiveMonths: 60,
    };
    expect(parseDataRetentionConfig(input)).toEqual(
      DEFAULT_DATA_RETENTION_CONFIG,
    );
  });

  test("負数はフォールバック（保持期間は非負整数）", () => {
    const input = {
      ...DEFAULT_DATA_RETENTION_CONFIG,
      sessionMonths: -1,
    };
    expect(parseDataRetentionConfig(input)).toEqual(
      DEFAULT_DATA_RETENTION_CONFIG,
    );
  });

  test("小数はフォールバック（int 強制）", () => {
    const input = {
      ...DEFAULT_DATA_RETENTION_CONFIG,
      sessionMonths: 6.5,
    };
    expect(parseDataRetentionConfig(input)).toEqual(
      DEFAULT_DATA_RETENTION_CONFIG,
    );
  });

  test("null / undefined / 不正型は DEFAULT にフォールバック", () => {
    expect(parseDataRetentionConfig(null)).toEqual(
      DEFAULT_DATA_RETENTION_CONFIG,
    );
    expect(parseDataRetentionConfig(undefined)).toEqual(
      DEFAULT_DATA_RETENTION_CONFIG,
    );
    expect(parseDataRetentionConfig("not-json")).toEqual(
      DEFAULT_DATA_RETENTION_CONFIG,
    );
    expect(parseDataRetentionConfig({ sessionMonths: "6" })).toEqual(
      DEFAULT_DATA_RETENTION_CONFIG,
    );
  });

  test("0 は opt-out として有効値（保持しない = 削除しない、opt-out）", () => {
    const input = { ...DEFAULT_DATA_RETENTION_CONFIG, sessionMonths: 0 };
    expect(parseDataRetentionConfig(input)).toEqual(input);
  });
});

describe("purge commands", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockClear();
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
    mockAnonymizeCustomerCommand.mockClear();
    mockAnonymizeCustomerCommand.mockImplementation((input) =>
      Promise.resolve(anonymizeCustomerResult(input.customerId)),
    );
    mockSessionDeleteMany.mockClear();
    mockSessionDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    mockVerificationDeleteMany.mockClear();
    mockVerificationDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    mockReservationUpdateMany.mockClear();
    mockReservationUpdateMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    mockInquiryDeleteMany.mockClear();
    mockInquiryDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    mockInquiryAttachmentFindMany.mockClear();
    mockInquiryAttachmentFindMany.mockImplementation(() => Promise.resolve([]));
    mockGetR2InquiriesBucketName.mockClear();
    mockGetR2InquiriesBucketName.mockImplementation(
      () => "test-inquiries-bucket",
    );
    mockDeleteObjectsFromBucket.mockClear();
    mockDeleteObjectsFromBucket.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
    mockCustomerFindMany.mockClear();
    mockCustomerFindMany.mockImplementation(() => Promise.resolve([]));
    mockCustomerUpdate.mockClear();
    mockCustomerUpdate.mockImplementation((args) =>
      Promise.resolve({ id: args.where.id }),
    );
  });

  test("months=0 なら各 purge は Prisma を触らず 0 を返す (opt-out 契約)", async () => {
    expect(await purgeExpiredSessions(NOW, 0)).toBe(0);
    expect(await purgeExpiredVerifications(NOW, 0)).toBe(0);
    expect(await anonymizeExpiredGuestReservations(NOW, 0)).toBe(0);
    expect(await purgeExpiredInquiries(NOW, 0)).toBe(0);
    expect(await anonymizeInactiveCustomers(NOW, 0)).toBe(0);

    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
    expect(mockVerificationDeleteMany).not.toHaveBeenCalled();
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    expect(mockInquiryDeleteMany).not.toHaveBeenCalled();
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
    expect(mockInquiryAttachmentFindMany).not.toHaveBeenCalled();
    expect(mockDeleteObjectsFromBucket).not.toHaveBeenCalled();
  });

  test("months>0 で対象 0 件 → 0 を返す (Prisma は 1 度呼ばれる)", async () => {
    const [s, v, r, i] = await Promise.all([
      purgeExpiredSessions(NOW, 6),
      purgeExpiredVerifications(NOW, 6),
      anonymizeExpiredGuestReservations(NOW, 12),
      purgeExpiredInquiries(NOW, 36),
    ]);
    expect([s, v, r, i]).toEqual([0, 0, 0, 0]);
    expect(mockSessionDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockVerificationDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockReservationUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockInquiryDeleteMany).toHaveBeenCalledTimes(1);
    // 対象 attachment が 0 件なら R2 delete は呼ばれない (no-op 短絡)。
    expect(mockDeleteObjectsFromBucket).not.toHaveBeenCalled();
  });

  test("purgeExpiredInquiries: 対象 inquiry に添付があれば DB delete 後に R2 一括削除する", async () => {
    mockInquiryAttachmentFindMany.mockImplementation(() =>
      Promise.resolve([
        { r2Key: "inquiries/a/1.jpg" },
        { r2Key: "inquiries/a/2.pdf" },
      ]),
    );
    mockInquiryDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 1 }),
    );

    const deleted = await purgeExpiredInquiries(NOW, 36);

    expect(deleted).toBe(1);
    expect(mockInquiryAttachmentFindMany).toHaveBeenCalledTimes(1);
    expect(mockInquiryDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockDeleteObjectsFromBucket).toHaveBeenCalledTimes(1);
    expect(mockDeleteObjectsFromBucket).toHaveBeenCalledWith(
      "test-inquiries-bucket",
      ["inquiries/a/1.jpg", "inquiries/a/2.pdf"],
    );
  });

  test("purgeExpiredInquiries: R2 bucket 未設定でも DB purge 自体は成功する (fail-open, log のみ)", async () => {
    mockInquiryAttachmentFindMany.mockImplementation(() =>
      Promise.resolve([{ r2Key: "inquiries/a/1.jpg" }]),
    );
    mockInquiryDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 1 }),
    );
    mockGetR2InquiriesBucketName.mockImplementation(() => {
      throw new Error("R2_INQUIRIES_BUCKET_NAME is not configured");
    });

    const deleted = await purgeExpiredInquiries(NOW, 36);

    expect(deleted).toBe(1);
    expect(mockDeleteObjectsFromBucket).not.toHaveBeenCalled();
  });

  test("purgeExpiredInquiries: R2 削除失敗でも DB purge の戻り値には影響しない (log のみ)", async () => {
    mockInquiryAttachmentFindMany.mockImplementation(() =>
      Promise.resolve([{ r2Key: "inquiries/a/1.jpg" }]),
    );
    mockInquiryDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 1 }),
    );
    mockDeleteObjectsFromBucket.mockImplementation(() =>
      Promise.resolve({ success: false }),
    );

    const deleted = await purgeExpiredInquiries(NOW, 36);

    expect(deleted).toBe(1);
    expect(mockDeleteObjectsFromBucket).toHaveBeenCalledTimes(1);
  });

  test("anonymizeInactiveCustomers は独自 update を持たず anonymizeCustomerCommand へ委譲する", async () => {
    // 「顧客を匿名化する」実装を 2 本持つと、必ず片方だけ育つ。実際に
    // anonymizedAt を刻まない・対象列が少ない・placeholder の綴りが違う、の
    // 3 点でずれていた。ここでは **customer.update を自分で呼ばないこと** と
    // **1 件ごとに command を呼ぶこと** を固定する。
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }, { id: "cust-2" }]),
    );

    const updated = await anonymizeInactiveCustomers(NOW, 84);

    expect(updated).toBe(2);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    expect(mockAnonymizeCustomerCommand).toHaveBeenCalledTimes(2);
    expect(
      mockAnonymizeCustomerCommand.mock.calls.map((call) => call[0]),
    ).toEqual([
      { customerId: "cust-1", reason: "data-retention" },
      { customerId: "cust-2", reason: "data-retention" },
    ]);
  });

  test("別経路が先に匿名化していた 1 件だけを飛ばし、cron 全体は止めない", async () => {
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }, { id: "cust-2" }]),
    );
    mockAnonymizeCustomerCommand.mockImplementation((input) => {
      if (input.customerId === "cust-1") {
        return Promise.reject(
          new DomainError("この顧客は既に匿名化済みです", "CONFLICT"),
        );
      }
      return Promise.resolve(anonymizeCustomerResult(input.customerId));
    });

    expect(await anonymizeInactiveCustomers(NOW, 84)).toBe(1);
  });

  test("CONFLICT 以外の失敗は握りつぶさない", async () => {
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }]),
    );
    mockAnonymizeCustomerCommand.mockImplementation(() =>
      Promise.reject(new DomainError("顧客が見つかりません", "NOT_FOUND")),
    );

    let thrown: unknown = null;
    try {
      await anonymizeInactiveCustomers(NOW, 84);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DomainError);
  });

  test("runDataRetentionPurge は 6 purge を全て呼び、結果を集約する", async () => {
    mockSessionDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 3 }),
    );
    mockInquiryDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 2 }),
    );
    mockReservationUpdateMany.mockImplementation(() =>
      Promise.resolve({ count: 5 }),
    );
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-x" }]),
    );
    const result = await runDataRetentionPurge(NOW, {
      ...DEFAULT_DATA_RETENTION_CONFIG,
    });
    expect(result).toEqual({
      sessionsDeleted: 3,
      verificationsDeleted: 0,
      reservationGuestFieldsAnonymized: 5,
      inquiriesDeleted: 2,
      customersAnonymized: 1,
    });
  });

  test("anonymizeExpiredGuestReservations の updateMany data は guestEmail と notes を null 化する (M-50/51)", async () => {
    await anonymizeExpiredGuestReservations(NOW, 12);
    const call = mockReservationUpdateMany.mock.calls[0]?.[0] as
      { data?: Record<string, unknown> } | undefined;
    expect(call?.data).toBeDefined();
    expect(call?.data).toHaveProperty("guestEmail", null);
    expect(call?.data).toHaveProperty("notes", null);
  });

  test("guest 匿名化の WHERE は endTime.lt で cutoff より古い予約だけを対象にする (M-52)", async () => {
    await anonymizeExpiredGuestReservations(NOW, 12);
    const cutoff = extractCutoffFromCall(mockReservationUpdateMany.mock.calls, [
      "where",
      "endTime",
      "lt",
    ]);
    expect(cutoff.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    const call = mockReservationUpdateMany.mock.calls[0]?.[0] as
      { where?: { endTime?: Record<string, unknown> } } | undefined;
    expect(call?.where?.endTime).not.toHaveProperty("gt");
  });

  test("purgeExpiredInquiries の WHERE は deletedAt の OR 分岐を持つ (M-57)", async () => {
    await purgeExpiredInquiries(NOW, 36);
    const call = mockInquiryDeleteMany.mock.calls[0]?.[0] as
      { where?: { OR?: Array<Record<string, unknown>> } } | undefined;
    const createdAtCutoff = extractCutoffFromCall(
      mockInquiryDeleteMany.mock.calls,
      ["where", "OR", "0", "createdAt", "lt"],
    );
    const deletedAtCutoff = extractCutoffFromCall(
      mockInquiryDeleteMany.mock.calls,
      ["where", "OR", "1", "deletedAt", "lt"],
    );
    expect(call?.where?.OR).toHaveLength(2);
    expect(createdAtCutoff.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(deletedAtCutoff.toISOString()).toBe(createdAtCutoff.toISOString());
  });

  test("runDataRetentionPurge の guest 匿名化は reservationGuestMonths を使う (M-58)", async () => {
    // reservationGuestMonths と inquiryMonths が食い違う fixture。
    // inquiryMonths を渡す変異では cutoff が 36mo 前になる。
    await runDataRetentionPurge(NOW, {
      ...DEFAULT_DATA_RETENTION_CONFIG,
      reservationGuestMonths: 6,
      inquiryMonths: 36,
    });
    const cutoff = extractCutoffFromCall(mockReservationUpdateMany.mock.calls, [
      "where",
      "endTime",
      "lt",
    ]);
    expect(cutoff.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });
});

// -----------------------------------------------------------------------------
// Codex review fix — regression tests
// -----------------------------------------------------------------------------

/**
 * 各 purge 関数が Prisma へ渡す WHERE の `cutoff` (< 比較の右辺) を取り出す。
 * mock の calls から最新呼び出しの WHERE 条件を掘り、cutoff Date を返す。
 */
function extractCutoffFromCall(
  calls: ReadonlyArray<ReadonlyArray<unknown>>,
  path: readonly string[],
): Date {
  const lastCall = calls[calls.length - 1];
  if (!lastCall) throw new Error("prisma mock was not called");
  let cursor: unknown = lastCall[0];
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`unexpected shape at ${key}`);
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (!(cursor instanceof Date)) {
    throw new Error("cutoff must be a Date instance");
  }
  return cursor;
}

describe("monthsAgo month-end overflow (Codex #3564864832)", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockClear();
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
    mockAnonymizeCustomerCommand.mockClear();
    mockAnonymizeCustomerCommand.mockImplementation((input) =>
      Promise.resolve(anonymizeCustomerResult(input.customerId)),
    );
    mockSessionDeleteMany.mockClear();
    mockSessionDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    mockCustomerFindMany.mockClear();
    mockCustomerFindMany.mockImplementation(() => Promise.resolve([]));
  });

  test("2027-08-31 - 6mo は 2027-02-28（Feb-31 の overflow を防ぐ）", async () => {
    // ネイティブ `setUTCMonth` は 2027-08-31 minus 6mo → 2027-03-03 になる。
    // これを cutoff にすると Mar 1-2 に作られたレコードが 6mo 未満で誤削除される。
    const augustEnd = new Date("2027-08-31T12:00:00Z");
    await purgeExpiredSessions(augustEnd, 6);
    const cutoff = extractCutoffFromCall(mockSessionDeleteMany.mock.calls, [
      "where",
      "createdAt",
      "lt",
    ]);
    expect(cutoff.toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  test("2028-08-31 - 6mo は 2028-02-29（閏年の末日にクランプする）", async () => {
    const augustEndLeap = new Date("2028-08-31T12:00:00Z");
    await purgeExpiredSessions(augustEndLeap, 6);
    const cutoff = extractCutoffFromCall(mockSessionDeleteMany.mock.calls, [
      "where",
      "createdAt",
      "lt",
    ]);
    expect(cutoff.toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  test("2027-01-15 - 1mo は 2026-12-15（年跨ぎで day を保持する）", async () => {
    const jan15 = new Date("2027-01-15T00:00:00Z");
    await purgeExpiredSessions(jan15, 1);
    const cutoff = extractCutoffFromCall(mockSessionDeleteMany.mock.calls, [
      "where",
      "createdAt",
      "lt",
    ]);
    expect(cutoff.toISOString().slice(0, 10)).toBe("2026-12-15");
  });

  test("2027-03-31 - 1mo は 2027-02-28（31 → 28 クランプ、時刻成分は保持）", async () => {
    const marEnd = new Date("2027-03-31T09:30:45.123Z");
    await purgeExpiredSessions(marEnd, 1);
    const cutoff = extractCutoffFromCall(mockSessionDeleteMany.mock.calls, [
      "where",
      "createdAt",
      "lt",
    ]);
    expect(cutoff.toISOString()).toBe("2027-02-28T09:30:45.123Z");
  });
});

describe("anonymizeInactiveCustomers WHERE contract (Codex #3564864835 → #3564883654 → #3564905126)", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockClear();
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
    mockAnonymizeCustomerCommand.mockClear();
    mockAnonymizeCustomerCommand.mockImplementation((input) =>
      Promise.resolve(anonymizeCustomerResult(input.customerId)),
    );
    mockCustomerFindMany.mockClear();
    mockCustomerFindMany.mockImplementation(() => Promise.resolve([]));
    mockCustomerUpdate.mockClear();
    mockCustomerUpdate.mockImplementation((args) =>
      Promise.resolve({ id: args.where.id }),
    );
  });

  test("WHERE は cached stat を使わず、Reservation 実履歴で recent/upcoming を判定する", async () => {
    await anonymizeInactiveCustomers(NOW, 84);
    const call = mockCustomerFindMany.mock.calls[0];
    if (!call) throw new Error("customer.findMany was not called");
    const args = call[0] as {
      where: {
        status: string;
        anonymizedAt: null;
        createdAt: { lt: Date };
        reservations: { none: { endTime: { gte: Date } } };
        // 明示的に「使わない」ことを固定するため、OR と lastReservationAt は存在しない
        OR?: unknown;
        lastReservationAt?: unknown;
      };
    };

    // 1) status / 冪等判定。**placeholder の綴りではなく証跡列で判定する**
    //    （綴りに頼ると、形式を変えた瞬間に全件が再匿名化対象になる）。
    expect(args.where.status).toBe("INACTIVE");
    expect(args.where.anonymizedAt).toBeNull();

    // 2) createdAt: fresh install 直後の customer を除外
    expect(args.where.createdAt.lt).toBeInstanceOf(Date);

    // 3) reservations relation filter: cutoff 以降の endTime を持つ予約が 0 件
    expect(args.where.reservations.none.endTime.gte).toBeInstanceOf(Date);
    // createdAt と reservations の cutoff は同一 Date (monthsAgo の 1 回計算を再利用)
    expect(args.where.createdAt.lt.toISOString()).toBe(
      args.where.reservations.none.endTime.gte.toISOString(),
    );

    // 4) cached stat `lastReservationAt` は WHERE に **含めない**
    //    stale-null / stale-high の両方向で信頼できないため、実履歴だけを唯一の根拠にする。
    expect(args.where.lastReservationAt).toBeUndefined();
    expect(args.where.OR).toBeUndefined();
  });

  test("cutoff は monthsAgo(NOW, months) と一致する (時刻成分も伝搬)", async () => {
    // NOW = 2027-01-15T00:00:00Z, months = 84 → 2020-01-15T00:00:00Z
    await anonymizeInactiveCustomers(NOW, 84);
    const call = mockCustomerFindMany.mock.calls[0];
    if (!call) throw new Error("customer.findMany was not called");
    const args = call[0] as {
      where: { createdAt: { lt: Date } };
    };
    expect(args.where.createdAt.lt.toISOString()).toBe(
      "2020-01-15T00:00:00.000Z",
    );
  });
});

describe("anonymizeInactiveCustomers audit log (M-60)", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockClear();
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
    mockAnonymizeCustomerCommand.mockClear();
    mockAnonymizeCustomerCommand.mockImplementation((input) =>
      Promise.resolve(anonymizeCustomerResult(input.customerId)),
    );
    mockCustomerFindMany.mockClear();
    mockCustomerFindMany.mockImplementation(() => Promise.resolve([]));
  });

  function expectedAuditInput(customerId: string) {
    const result = anonymizeCustomerResult(customerId);
    return {
      action: AuditAction.UPDATE,
      resource: "customer.anonymization",
      resourceId: customerId,
      newValue: {
        reason: result.reason,
        anonymizedAt: result.anonymizedAt.toISOString(),
        hadUserId: result.hadUserId,
        preservedSuppression: result.preservedSuppression,
        anonymizedFields: ANONYMIZED_CUSTOMER_FIELDS,
        anonymizedInquiryIds: result.anonymizedInquiryIds,
      },
      metadata: { triggeredBy: "data-retention-cron" },
    };
  }

  test("成功した顧客ごとに system actor の AuditLog を 1 件書く", async () => {
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }, { id: "cust-2" }]),
    );

    await anonymizeInactiveCustomers(NOW, 84);

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(2);
    const payloads = mockCreateAuditLogRecord.mock.calls.map((call) => call[0]);
    expect(payloads).toEqual([
      expectedAuditInput("cust-1"),
      expectedAuditInput("cust-2"),
    ]);
    for (const payload of payloads) {
      expect(payload).not.toHaveProperty("userId");
    }
  });

  test("findMany が空なら AuditLog を書かない", async () => {
    await anonymizeInactiveCustomers(NOW, 84);
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });

  test("months<=0 なら AuditLog を書かない", async () => {
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }]),
    );
    await anonymizeInactiveCustomers(NOW, 0);
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });

  test("CONFLICT の顧客は AuditLog を書かず、他の顧客は書く", async () => {
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }, { id: "cust-2" }]),
    );
    mockAnonymizeCustomerCommand.mockImplementation((input) => {
      if (input.customerId === "cust-1") {
        return Promise.reject(
          new DomainError("この顧客は既に匿名化済みです", "CONFLICT"),
        );
      }
      return Promise.resolve(anonymizeCustomerResult(input.customerId));
    });

    expect(await anonymizeInactiveCustomers(NOW, 84)).toBe(1);
    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLogRecord.mock.calls[0]?.[0]).toEqual(
      expectedAuditInput("cust-2"),
    );
    expect(mockCreateAuditLogRecord.mock.calls[0]?.[0]).not.toHaveProperty(
      "userId",
    );
  });
});
