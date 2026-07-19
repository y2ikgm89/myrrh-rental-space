/**
 * RESEND-AUDIT M7: preserve suppression state across Customer anonymize/merge.
 *
 * anonymizeCustomerCommand は emailCanonical を `deleted+<id>@anonymized.local`
 * に書き換えるが、`emailDeliveryStatus` (HARD_BOUNCED / COMPLAINED) は残す。
 * 従来 `getSuppressedEmailSet()` は匿名化後の placeholder を hash してしまい、
 * 実 email の suppression が silent に失われていた (再登録した同 email に
 * 送信できてしまい sender reputation を悪化させる)。
 *
 * 修正内容: `Customer.suppressedEmailHash` を nullable で追加し、
 * anonymize/merge で emailCanonical を書き換える前に、被抑制状態の
 * emailCanonical の `hashSuppressedEmailCandidate` 値を保存する。
 *
 * 本 test は以下を pin する:
 *   1. HARD_BOUNCED の Customer anonymize → 元 emailCanonical の hash が保存される
 *   2. OK Customer anonymize → suppressedEmailHash は set されない
 *   3. COMPLAINED Customer anonymize → hash が保存される
 *   4. 抑制 source を非抑制 target にマージ → target に元 hash が持ち越される
 *   5. 匿名化前の hash と、送信側での `hashSuppressedEmailCandidate` の
 *      計算結果が一致する (semantic 等価性)
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createHash } from "node:crypto";

const EmailDeliveryStatus = {
  OK: "OK",
  SOFT_BOUNCED: "SOFT_BOUNCED",
  HARD_BOUNCED: "HARD_BOUNCED",
  COMPLAINED: "COMPLAINED",
} as const;
type EmailDeliveryStatusValue =
  (typeof EmailDeliveryStatus)[keyof typeof EmailDeliveryStatus];

const CustomerStatus = {
  NEW: "NEW",
  REGULAR: "REGULAR",
  VIP: "VIP",
  INACTIVE: "INACTIVE",
  BLACKLIST: "BLACKLIST",
} as const;

const CustomerType = {
  PERSONAL: "PERSONAL",
  CORPORATE: "CORPORATE",
} as const;

type CustomerRow = {
  id: string;
  userId: string | null;
  anonymizedAt: Date | null;
  emailCanonical: string;
  emailDeliveryStatus: EmailDeliveryStatusValue;
  suppressedEmailHash: string | null;
};

type CustomerUpdateCall = {
  where: { id: string };
  data: Record<string, unknown>;
};

const mockCustomerFindUnique = mock<
  (args: {
    where: { id: string };
    select?: Record<string, boolean>;
  }) => Promise<CustomerRow | null>
>(() => Promise.resolve(null));

const mockCustomerUpdate = mock<
  (args: CustomerUpdateCall) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "customer-1" }));

const mockUserDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "user-1" }),
);

const mockReservationUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockInquiryUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockReviewUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockEventRegistrationUpdateMany = mock<() => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 0 }),
);

const mockCustomerDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "customer-1" }),
);

// recomputeCustomerReservationStats は $queryRaw + tx.customer.update を使う。
// mock 側で $queryRaw を返せば通せるが、merge のテストはロジック分岐のみを
// 見るため recomputeCustomerReservationStats そのものを no-op mock 化する。
mock.module("@/shared/domain/reservations/payloads", () => ({
  recomputeCustomerReservationStats: mock(() => Promise.resolve()),
}));

mock.module("server-only", () => ({}));

mock.module("@generated/prisma/enums", () => ({
  CustomerStatus,
  CustomerType,
  EmailDeliveryStatus,
}));

mock.module("@generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError {
      code: string;
      constructor(_msg: string, opts: { code: string }) {
        this.code = opts.code;
      }
    },
  },
}));

mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}));

const prismaCustomer = {
  findUnique: mockCustomerFindUnique,
  update: mockCustomerUpdate,
  delete: mockCustomerDelete,
};

const prismaUser = {
  delete: mockUserDelete,
};

const prismaReservation = {
  updateMany: mockReservationUpdateMany,
};
const prismaInquiry = {
  updateMany: mockInquiryUpdateMany,
};
const prismaSpaceReview = {
  updateMany: mockReviewUpdateMany,
};
const prismaEventRegistration = {
  updateMany: mockEventRegistrationUpdateMany,
};

type TxShape = {
  customer: typeof prismaCustomer;
  user: typeof prismaUser;
  reservation: typeof prismaReservation;
  inquiry: typeof prismaInquiry;
  spaceReview: typeof prismaSpaceReview;
  eventRegistration: typeof prismaEventRegistration;
};

const txShape: TxShape = {
  customer: prismaCustomer,
  user: prismaUser,
  reservation: prismaReservation,
  inquiry: prismaInquiry,
  spaceReview: prismaSpaceReview,
  eventRegistration: prismaEventRegistration,
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    ...txShape,
    $transaction: <T>(fn: (tx: TxShape) => Promise<T>) => fn(txShape),
  },
}));

// 遅延 import: mock.module 適用後に SUT を読み込む
const { anonymizeCustomerCommand, mergeCustomerCommand } =
  await import("@/shared/domain/customers/commands");
const { hashSuppressedEmailCandidate } =
  await import("@/shared/domain/customers/queries");

// --- test data ---------------------------------------------------------------

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "660e8400-e29b-41d4-a716-446655440000";
const TARGET_ID = "770e8400-e29b-41d4-a716-446655440000";

const ORIGINAL_EMAIL_CANONICAL = "real.user@example.com";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// --- helpers ----------------------------------------------------------------

function extractUpdateCallData(
  mockFn: typeof mockCustomerUpdate,
): Record<string, unknown> | null {
  const call = mockFn.mock.calls[0];
  if (!call) return null;
  const first = call[0];
  if (
    typeof first !== "object" ||
    first === null ||
    !("data" in first) ||
    typeof first.data !== "object" ||
    first.data === null
  ) {
    return null;
  }
  return first.data as Record<string, unknown>;
}

function extractAllUpdateCallData(
  mockFn: typeof mockCustomerUpdate,
): Array<Record<string, unknown>> {
  return mockFn.mock.calls
    .map((call) => {
      const first = call[0];
      if (
        typeof first !== "object" ||
        first === null ||
        !("data" in first) ||
        typeof first.data !== "object" ||
        first.data === null
      ) {
        return null;
      }
      return first.data as Record<string, unknown>;
    })
    .filter((v): v is Record<string, unknown> => v !== null);
}

describe("anonymizeCustomerCommand — preserves suppression state (RESEND-AUDIT M7)", () => {
  beforeEach(() => {
    mockCustomerFindUnique.mockReset();
    mockCustomerUpdate.mockReset();
    mockCustomerDelete.mockReset();
    mockUserDelete.mockReset();
    mockReservationUpdateMany.mockReset();
    mockInquiryUpdateMany.mockReset();
    mockReviewUpdateMany.mockReset();
    mockEventRegistrationUpdateMany.mockReset();

    mockCustomerUpdate.mockResolvedValue({ id: CUSTOMER_ID });
    mockCustomerDelete.mockResolvedValue({ id: CUSTOMER_ID });
    mockUserDelete.mockResolvedValue({ id: USER_ID });
    mockReservationUpdateMany.mockResolvedValue({ count: 0 });
    mockInquiryUpdateMany.mockResolvedValue({ count: 0 });
    mockReviewUpdateMany.mockResolvedValue({ count: 0 });
    mockEventRegistrationUpdateMany.mockResolvedValue({ count: 0 });
  });

  test("HARD_BOUNCED の Customer を anonymize すると suppressedEmailHash に 元 emailCanonical hash が保存される", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: ORIGINAL_EMAIL_CANONICAL,
      emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
      suppressedEmailHash: null,
    });

    const result = await anonymizeCustomerCommand({
      customerId: CUSTOMER_ID,
      reason: "customer-requested",
    });

    expect(result.preservedSuppression).toBe(true);

    const data = extractUpdateCallData(mockCustomerUpdate);
    expect(data).not.toBeNull();

    // 元 emailCanonical の hash が persistent 保存される (実 email に一致する
    // 送信側 hashSuppressedEmailCandidate の結果と bit-for-bit 同じ)。
    const expectedHash = sha256Hex(ORIGINAL_EMAIL_CANONICAL);
    expect(data?.["suppressedEmailHash"]).toBe(expectedHash);
    expect(hashSuppressedEmailCandidate(ORIGINAL_EMAIL_CANONICAL)).toBe(
      expectedHash,
    );

    // emailCanonical は同一 update 内で placeholder に書き換わる (原契約維持)
    expect(data?.["emailCanonical"]).toBe(
      `deleted+${CUSTOMER_ID}@anonymized.local`,
    );
  });

  test("OK 状態の Customer を anonymize しても suppressedEmailHash は書き込まれない", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "normal@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      suppressedEmailHash: null,
    });

    const result = await anonymizeCustomerCommand({
      customerId: CUSTOMER_ID,
      reason: "customer-requested",
    });

    expect(result.preservedSuppression).toBe(false);

    const data = extractUpdateCallData(mockCustomerUpdate);
    expect(data).not.toBeNull();
    // suppressedEmailHash key は data payload に含まれない (spread で省略)
    expect(data?.["suppressedEmailHash"]).toBeUndefined();
  });

  test("COMPLAINED の Customer を anonymize すると hash が保存される (COMPLAINED も抑制対象)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "spam.reporter@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.COMPLAINED,
      suppressedEmailHash: null,
    });

    const result = await anonymizeCustomerCommand({
      customerId: CUSTOMER_ID,
      reason: "admin-purge",
    });

    expect(result.preservedSuppression).toBe(true);

    const data = extractUpdateCallData(mockCustomerUpdate);
    expect(data?.["suppressedEmailHash"]).toBe(
      hashSuppressedEmailCandidate("spam.reporter@example.com"),
    );
  });

  test("SOFT_BOUNCED は抑制対象ではないため suppressedEmailHash は書き込まれない", async () => {
    // SOFT_BOUNCED は一時的な失敗のため suppression 対象外
    // (getSuppressedEmailSet の where 条件と一致することを担保する)。
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "soft-bounce@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.SOFT_BOUNCED,
      suppressedEmailHash: null,
    });

    const result = await anonymizeCustomerCommand({
      customerId: CUSTOMER_ID,
      reason: "customer-requested",
    });

    expect(result.preservedSuppression).toBe(false);
    const data = extractUpdateCallData(mockCustomerUpdate);
    expect(data?.["suppressedEmailHash"]).toBeUndefined();
  });

  test("anonymize 前の emailCanonical hash が sendEmail 側の hashSuppressedEmailCandidate と一致する (semantic 等価性を pin)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: ORIGINAL_EMAIL_CANONICAL,
      emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
      suppressedEmailHash: null,
    });

    await anonymizeCustomerCommand({
      customerId: CUSTOMER_ID,
      reason: "customer-requested",
    });

    // Round-trip: save-side stores `hashSuppressedEmailCandidate(canonical)`;
    // send-side computes the same and does `.has()`. If either side changed
    // its hash contract the values would diverge silently — this pins them.
    const savedHash =
      extractUpdateCallData(mockCustomerUpdate)?.["suppressedEmailHash"];
    expect(savedHash).toBe(
      hashSuppressedEmailCandidate(ORIGINAL_EMAIL_CANONICAL),
    );
  });
});

describe("mergeCustomerCommand — preserves suppression state (RESEND-AUDIT M7)", () => {
  beforeEach(() => {
    mockCustomerFindUnique.mockReset();
    mockCustomerUpdate.mockReset();
    mockCustomerDelete.mockReset();
    mockReservationUpdateMany.mockReset();
    mockInquiryUpdateMany.mockReset();
    mockReviewUpdateMany.mockReset();
    mockEventRegistrationUpdateMany.mockReset();

    mockCustomerUpdate.mockResolvedValue({ id: TARGET_ID });
    mockCustomerDelete.mockResolvedValue({ id: CUSTOMER_ID });
    mockReservationUpdateMany.mockResolvedValue({ count: 0 });
    mockInquiryUpdateMany.mockResolvedValue({ count: 0 });
    mockReviewUpdateMany.mockResolvedValue({ count: 0 });
    mockEventRegistrationUpdateMany.mockResolvedValue({ count: 0 });
  });

  test("HARD_BOUNCED の source を non-suppressed target にマージすると target に元 email hash が持ち越される", async () => {
    const SOURCE_EMAIL = "bounced.source@example.com";
    // source (HARD_BOUNCED)
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: SOURCE_EMAIL,
      emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
      suppressedEmailHash: null,
    });
    // target (OK)
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "target.ok@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      suppressedEmailHash: null,
    });

    const result = await mergeCustomerCommand(CUSTOMER_ID, TARGET_ID);
    expect(result.preservedSuppression).toBe(true);

    // customer.update が target に対して suppressedEmailHash を書いたか
    const allUpdates = extractAllUpdateCallData(mockCustomerUpdate);
    const targetUpdate = allUpdates.find(
      (d) => d["suppressedEmailHash"] !== undefined,
    );
    expect(targetUpdate).toBeDefined();
    expect(targetUpdate?.["suppressedEmailHash"]).toBe(
      hashSuppressedEmailCandidate(SOURCE_EMAIL),
    );

    // source は物理削除される (契約維持)
    expect(mockCustomerDelete).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID },
    });
  });

  test("source が既に anonymized で suppressedEmailHash を持つ場合、その hash がそのまま target に持ち越される (再 hash しない)", async () => {
    // 匿名化済み source (emailCanonical は placeholder、hash は元 email のもの)
    const ORIGINAL_HASH = sha256Hex("original@example.com");
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: new Date("2026-01-01"),
      emailCanonical: `deleted+${CUSTOMER_ID}@anonymized.local`,
      emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
      suppressedEmailHash: ORIGINAL_HASH,
    });
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "target.ok@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      suppressedEmailHash: null,
    });

    const result = await mergeCustomerCommand(CUSTOMER_ID, TARGET_ID);
    expect(result.preservedSuppression).toBe(true);

    const allUpdates = extractAllUpdateCallData(mockCustomerUpdate);
    const targetUpdate = allUpdates.find(
      (d) => d["suppressedEmailHash"] !== undefined,
    );
    // 元 hash をそのまま流用 (placeholder emailCanonical を hash しない)
    expect(targetUpdate?.["suppressedEmailHash"]).toBe(ORIGINAL_HASH);
  });

  test("source も target も非抑制なら suppressedEmailHash は書き込まれない", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "source.ok@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      suppressedEmailHash: null,
    });
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "target.ok@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      suppressedEmailHash: null,
    });

    const result = await mergeCustomerCommand(CUSTOMER_ID, TARGET_ID);
    expect(result.preservedSuppression).toBe(false);

    const allUpdates = extractAllUpdateCallData(mockCustomerUpdate);
    const targetUpdate = allUpdates.find(
      (d) => d["suppressedEmailHash"] !== undefined,
    );
    expect(targetUpdate).toBeUndefined();
  });

  test("target が既に suppressedEmailHash を持つ場合は上書きしない (既存持ち越しを潰さない)", async () => {
    const SOURCE_EMAIL = "bounced.source@example.com";
    const TARGET_EXISTING_HASH = sha256Hex("previously-preserved@example.com");
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: SOURCE_EMAIL,
      emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
      suppressedEmailHash: null,
    });
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: "target.ok@example.com",
      emailDeliveryStatus: EmailDeliveryStatus.OK,
      suppressedEmailHash: TARGET_EXISTING_HASH,
    });

    const result = await mergeCustomerCommand(CUSTOMER_ID, TARGET_ID);
    expect(result.preservedSuppression).toBe(false);

    const allUpdates = extractAllUpdateCallData(mockCustomerUpdate);
    const targetUpdate = allUpdates.find(
      (d) => d["suppressedEmailHash"] !== undefined,
    );
    expect(targetUpdate).toBeUndefined();
  });

  test("target 自身が既に自 email で HARD_BOUNCED なら重複 write は避ける (target 経路で自動的にカバー)", async () => {
    const TARGET_EMAIL = "target.bounced@example.com";
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      userId: null,
      anonymizedAt: null,
      // source は target と同じ email で HARD_BOUNCED
      emailCanonical: TARGET_EMAIL,
      emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
      suppressedEmailHash: null,
    });
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      userId: null,
      anonymizedAt: null,
      emailCanonical: TARGET_EMAIL,
      emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
      suppressedEmailHash: null,
    });

    const result = await mergeCustomerCommand(CUSTOMER_ID, TARGET_ID);
    // target 自身の emailCanonical hash で既に getSuppressedEmailSet がカバー
    // するため、suppressedEmailHash を追記する意味がない → false
    expect(result.preservedSuppression).toBe(false);

    const allUpdates = extractAllUpdateCallData(mockCustomerUpdate);
    const targetUpdate = allUpdates.find(
      (d) => d["suppressedEmailHash"] !== undefined,
    );
    expect(targetUpdate).toBeUndefined();
  });
});
