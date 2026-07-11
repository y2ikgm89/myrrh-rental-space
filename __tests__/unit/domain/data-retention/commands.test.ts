import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  parseDataRetentionConfig,
  DEFAULT_DATA_RETENTION_CONFIG,
} from "@/shared/lib/json-validators";

// Prisma を mock で切り離す。domain 関数が呼び出す method の contract を interface で満たす。

type DeleteManyResult = { count: number };

const mockSessionDeleteMany = mock<() => Promise<DeleteManyResult>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockVerificationDeleteMany = mock<() => Promise<DeleteManyResult>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockLoginAttemptDeleteMany = mock<() => Promise<DeleteManyResult>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockReservationUpdateMany = mock<() => Promise<DeleteManyResult>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockInquiryDeleteMany = mock<() => Promise<DeleteManyResult>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockCustomerFindMany = mock<() => Promise<Array<{ id: string }>>>(() =>
  Promise.resolve([]),
);
const mockCustomerUpdate = mock<
  (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{
    id: string;
  }>
>((args) => Promise.resolve({ id: args.where.id }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    session: { deleteMany: () => mockSessionDeleteMany() },
    verification: { deleteMany: () => mockVerificationDeleteMany() },
    loginAttempt: { deleteMany: () => mockLoginAttemptDeleteMany() },
    reservation: { updateMany: () => mockReservationUpdateMany() },
    inquiry: { deleteMany: () => mockInquiryDeleteMany() },
    customer: {
      findMany: () => mockCustomerFindMany(),
      update: (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => mockCustomerUpdate(args),
    },
    settings: { findUnique: mock() },
  },
}));

const {
  purgeExpiredSessions,
  purgeExpiredVerifications,
  purgeExpiredLoginAttempts,
  anonymizeExpiredGuestReservations,
  purgeExpiredInquiries,
  anonymizeInactiveCustomers,
  runDataRetentionPurge,
} = await import("@/shared/domain/data-retention/commands");

const NOW = new Date("2027-01-15T00:00:00Z");

describe("parseDataRetentionConfig", () => {
  test("完全な JSON はそのまま parse される", () => {
    const input = {
      sessionMonths: 3,
      verificationMonths: 3,
      loginAttemptMonths: 3,
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
      loginAttemptMonths: 3,
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
    mockSessionDeleteMany.mockClear();
    mockSessionDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    mockVerificationDeleteMany.mockClear();
    mockVerificationDeleteMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    mockLoginAttemptDeleteMany.mockClear();
    mockLoginAttemptDeleteMany.mockImplementation(() =>
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
    expect(await purgeExpiredLoginAttempts(NOW, 0)).toBe(0);
    expect(await anonymizeExpiredGuestReservations(NOW, 0)).toBe(0);
    expect(await purgeExpiredInquiries(NOW, 0)).toBe(0);
    expect(await anonymizeInactiveCustomers(NOW, 0)).toBe(0);

    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
    expect(mockVerificationDeleteMany).not.toHaveBeenCalled();
    expect(mockLoginAttemptDeleteMany).not.toHaveBeenCalled();
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    expect(mockInquiryDeleteMany).not.toHaveBeenCalled();
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
  });

  test("months>0 で対象 0 件 → 0 を返す (Prisma は 1 度呼ばれる)", async () => {
    const [s, v, l, r, i] = await Promise.all([
      purgeExpiredSessions(NOW, 6),
      purgeExpiredVerifications(NOW, 6),
      purgeExpiredLoginAttempts(NOW, 6),
      anonymizeExpiredGuestReservations(NOW, 12),
      purgeExpiredInquiries(NOW, 36),
    ]);
    expect([s, v, l, r, i]).toEqual([0, 0, 0, 0, 0]);
    expect(mockSessionDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockVerificationDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockLoginAttemptDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockReservationUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockInquiryDeleteMany).toHaveBeenCalledTimes(1);
  });

  test("anonymizeInactiveCustomers は per-record で個別 update を発行し、email を anonymized-<uuid> 形式に置換する", async () => {
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }, { id: "cust-2" }]),
    );
    const updated = await anonymizeInactiveCustomers(NOW, 84);
    expect(updated).toBe(2);
    expect(mockCustomerUpdate).toHaveBeenCalledTimes(2);

    const emails = mockCustomerUpdate.mock.calls.map((call) => {
      const args = call[0];
      const data = args.data as Record<string, unknown>;
      return String(data["email"]);
    });
    // 全 email が anonymized- で始まり、@myrrh-anon.invalid で終わる
    for (const email of emails) {
      expect(email.startsWith("anonymized-")).toBe(true);
      expect(email.endsWith("@myrrh-anon.invalid")).toBe(true);
    }
    // per-record で異なる UUID を発行しているので、複数レコード間で email が衝突しない
    expect(new Set(emails).size).toBe(emails.length);
  });

  test("anonymizeInactiveCustomers は phoneNumber / postalCode 等の PII を NULL 化し、氏名は保持する", async () => {
    mockCustomerFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "cust-1" }]),
    );
    await anonymizeInactiveCustomers(NOW, 84);
    const args = mockCustomerUpdate.mock.calls[0]?.[0];
    if (!args) throw new Error("customer update was not called");
    const data = args.data as Record<string, unknown>;
    expect(data["phoneNumber"]).toBeNull();
    expect(data["postalCode"]).toBeNull();
    expect(data["prefecture"]).toBeNull();
    expect(data["city"]).toBeNull();
    expect(data["streetAddress"]).toBeNull();
    expect(data["building"]).toBeNull();
    // 予約明細の表示用に氏名は明示的に触らない
    expect("lastName" in data).toBe(false);
    expect("firstName" in data).toBe(false);
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
      loginAttemptsDeleted: 0,
      reservationGuestFieldsAnonymized: 5,
      inquiriesDeleted: 2,
      customersAnonymized: 1,
    });
  });
});
