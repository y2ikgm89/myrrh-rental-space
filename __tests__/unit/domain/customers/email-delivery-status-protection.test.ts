import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma enum 定数（本テストは prisma を直接触らず、runtime 値だけ必要）。
const EmailDeliveryStatus = {
  OK: "OK",
  SOFT_BOUNCED: "SOFT_BOUNCED",
  HARD_BOUNCED: "HARD_BOUNCED",
  COMPLAINED: "COMPLAINED",
} as const;
type EmailDeliveryStatus =
  (typeof EmailDeliveryStatus)[keyof typeof EmailDeliveryStatus];

// prisma.customer.updateMany の受け取り引数を捕捉する mock。
// updateCustomerEmailDeliveryStatusByEmail は `notIn` 保護節を組み立てて
// updateMany を呼ぶだけなので、渡される where 節を検証すれば L1 の保護マトリクス
// が正しく組まれているかを直接確認できる（実 DB は不要）。
type UpdateManyArgs = {
  where: {
    emailCanonical: string;
    emailDeliveryStatus?: { notIn: EmailDeliveryStatus[] };
  };
  data: unknown;
};

const capturedCalls: UpdateManyArgs[] = [];

const mockCustomerUpdateMany = mock<
  (args: UpdateManyArgs) => Promise<{ count: number }>
>((args) => {
  capturedCalls.push(args);
  return Promise.resolve({ count: 1 });
});

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      updateMany: mockCustomerUpdateMany,
      // 未使用でも interface を満たすためのダミー。
      findUnique: () => Promise.resolve(null),
      findFirst: () => Promise.resolve(null),
      create: () => Promise.resolve({ id: "x" }),
      update: () => Promise.resolve({ id: "x" }),
      findUniqueOrThrow: () =>
        Promise.resolve({ id: "x", email: null as string | null }),
    },
    $transaction: <T>(
      fn: (tx: {
        customer: { updateMany: typeof mockCustomerUpdateMany };
      }) => Promise<T> | T,
    ) =>
      Promise.resolve(fn({ customer: { updateMany: mockCustomerUpdateMany } })),
  },
}));

// `@generated/prisma/enums` は mock せず本物を使う（EmailDeliveryStatus 以外の
// enum も他モジュールから transitively 参照されるため、部分 mock で named-export
// 不在エラーが起きる）。本テストで参照する EmailDeliveryStatus の文字列値は
// 上記 const と一致していることを import 時に assert する。
const { EmailDeliveryStatus: RealEmailDeliveryStatus } =
  await import("@generated/prisma/enums");
if (
  RealEmailDeliveryStatus.OK !== EmailDeliveryStatus.OK ||
  RealEmailDeliveryStatus.SOFT_BOUNCED !== EmailDeliveryStatus.SOFT_BOUNCED ||
  RealEmailDeliveryStatus.HARD_BOUNCED !== EmailDeliveryStatus.HARD_BOUNCED ||
  RealEmailDeliveryStatus.COMPLAINED !== EmailDeliveryStatus.COMPLAINED
) {
  throw new Error(
    "EmailDeliveryStatus enum values drifted; update this test constant.",
  );
}

const { updateCustomerEmailDeliveryStatusByEmail } =
  await import("@/shared/domain/customers/commands");

function popLastCall(): UpdateManyArgs {
  const call = capturedCalls[capturedCalls.length - 1];
  if (!call) throw new Error("updateMany was not called");
  return call;
}

function protectedStates(call: UpdateManyArgs): EmailDeliveryStatus[] {
  return call.where.emailDeliveryStatus?.notIn ?? [];
}

describe("updateCustomerEmailDeliveryStatusByEmail — L1 protection matrix", () => {
  beforeEach(() => {
    capturedCalls.length = 0;
    mockCustomerUpdateMany.mockClear();
  });

  test("SOFT_BOUNCED は HARD_BOUNCED / COMPLAINED を上書きしない（両方が notIn に入る）", async () => {
    await updateCustomerEmailDeliveryStatusByEmail(
      "user@example.com",
      EmailDeliveryStatus.SOFT_BOUNCED,
      "transient",
    );

    const call = popLastCall();
    const notIn = protectedStates(call);
    expect(notIn).toContain(EmailDeliveryStatus.HARD_BOUNCED);
    expect(notIn).toContain(EmailDeliveryStatus.COMPLAINED);
    // SOFT_BOUNCED 自体は保護対象に入らない（同じステートへの上書きは冗長だが害なし）。
    expect(notIn).not.toContain(EmailDeliveryStatus.SOFT_BOUNCED);
    expect(notIn).not.toContain(EmailDeliveryStatus.OK);
  });

  test("HARD_BOUNCED は SOFT_BOUNCED を上書きしてよい（notIn に SOFT_BOUNCED は含まない）が COMPLAINED は保護する", async () => {
    await updateCustomerEmailDeliveryStatusByEmail(
      "user@example.com",
      EmailDeliveryStatus.HARD_BOUNCED,
      "permanent",
    );

    const call = popLastCall();
    const notIn = protectedStates(call);
    // L1 の核心: COMPLAINED は HARD_BOUNCED でも clobber できない。
    expect(notIn).toContain(EmailDeliveryStatus.COMPLAINED);
    // SOFT_BOUNCED は上書き可能（旧実装と同じ挙動）。
    expect(notIn).not.toContain(EmailDeliveryStatus.SOFT_BOUNCED);
    expect(notIn).not.toContain(EmailDeliveryStatus.HARD_BOUNCED);
    expect(notIn).not.toContain(EmailDeliveryStatus.OK);
  });

  test("COMPLAINED は常に勝つ（notIn は空 = 保護節を組み立てない）", async () => {
    await updateCustomerEmailDeliveryStatusByEmail(
      "user@example.com",
      EmailDeliveryStatus.COMPLAINED,
      "spam",
    );

    const call = popLastCall();
    // 保護節そのものが省略されている（`emailDeliveryStatus` キーが where に無い）。
    expect(call.where.emailDeliveryStatus).toBeUndefined();
  });

  test("OK（明示リセット）は保護節を組み立てない", async () => {
    await updateCustomerEmailDeliveryStatusByEmail(
      "user@example.com",
      EmailDeliveryStatus.OK,
      null,
    );

    const call = popLastCall();
    expect(call.where.emailDeliveryStatus).toBeUndefined();
  });

  test("非対称性の確認: HARD_BOUNCED は既存 COMPLAINED を書き換えられない（regression gate）", async () => {
    // 再配信された HARD_BOUNCED webhook が新しい COMPLAINED を clobber する
    // 事故を防ぐための最重要 assertion。
    await updateCustomerEmailDeliveryStatusByEmail(
      "user@example.com",
      EmailDeliveryStatus.HARD_BOUNCED,
      "permanent",
    );

    const notIn = protectedStates(popLastCall());
    expect(notIn).toEqual(
      expect.arrayContaining([EmailDeliveryStatus.COMPLAINED]),
    );
  });
});
