/**
 * testStripeConnectionAction — 未保存キーの接続テストが DB に書き込まないことを検証。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockRecordStripeConnectionSuccess = mock<
  (accountId?: string) => Promise<void>
>(() => Promise.resolve());
const mockTestStripeConnection = mock<
  (secretKey: string) => Promise<{
    success: boolean;
    accountId?: string;
    mode?: "test" | "live";
    error?: string;
  }>
>(() =>
  Promise.resolve({
    success: true,
    accountId: "acct_test123",
    mode: "test",
  }),
);

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: () => Promise<T>;
  }): Promise<T> => options.execute(),
}));

mock.module("@/shared/lib/stripe", () => ({
  testStripeConnection: mockTestStripeConnection,
}));

mock.module("@/shared/domain/settings/stripe-commands", () => ({
  recordStripeConnectionSuccess: mockRecordStripeConnectionSuccess,
  updateStripeSettings: mock(() => Promise.resolve()),
  clearStripeKeys: mock(() => Promise.resolve()),
}));

const { testStripeConnectionAction } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/settings/stripe");

describe("testStripeConnectionAction", () => {
  beforeEach(() => {
    mockRecordStripeConnectionSuccess.mockReset();
    mockTestStripeConnection.mockReset();
    mockTestStripeConnection.mockResolvedValue({
      success: true,
      accountId: "acct_test123",
      mode: "test",
    });
  });

  test("接続成功時も recordStripeConnectionSuccess を呼ばない", async () => {
    const result = await testStripeConnectionAction("sk_test_abc123");

    expect(result).toEqual({
      accountId: "acct_test123",
      mode: "test",
    });
    expect(mockRecordStripeConnectionSuccess).not.toHaveBeenCalled();
  });
});
