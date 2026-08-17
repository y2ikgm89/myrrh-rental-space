/**
 * testStripeConnectionAction — 接続テスト結果を IntegrationHealth に書く。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { IntegrationKey } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

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

const mockRecordConnectionTestResult = mock(
  async (_key: unknown, _result: { success: boolean; error?: string }) =>
    undefined,
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
  updateStripeSettings: mock(() => Promise.resolve()),
  clearStripeKeys: mock(() => Promise.resolve()),
}));

mock.module("@/shared/domain/settings/connection-health", () => ({
  recordConnectionTestResult: (
    key: unknown,
    result: { success: boolean; error?: string },
  ) => mockRecordConnectionTestResult(key, result),
  getConnectionHealth: mock(() =>
    Promise.resolve({
      status: null,
      lastCheckedAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
    }),
  ),
  getConnectionHealthMap: mock(() => Promise.resolve({})),
  clearConnectionHealth: mock(() => Promise.resolve()),
  recordConnectionApiResult: mock(() => Promise.resolve()),
  recordConnectionSuccess: mock(() => Promise.resolve()),
  recordConnectionFailure: mock(() => Promise.resolve()),
  withStripeConnectionHealth: async <T>(run: () => Promise<T>) => run(),
}));

const { testStripeConnectionAction } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/settings/stripe");

describe("testStripeConnectionAction", () => {
  beforeEach(() => {
    mockTestStripeConnection.mockReset();
    mockRecordConnectionTestResult.mockReset();
    mockTestStripeConnection.mockResolvedValue({
      success: true,
      accountId: "acct_test123",
      mode: "test",
    });
  });

  test("接続成功時は CONNECTED を記録し検証結果を返す", async () => {
    const result = await testStripeConnectionAction("sk_test_abc123");

    expect(result).toEqual({
      accountId: "acct_test123",
      mode: "test",
    });
    expect(mockTestStripeConnection).toHaveBeenCalledWith("sk_test_abc123");
    expect(mockRecordConnectionTestResult).toHaveBeenCalledWith(
      IntegrationKey.STRIPE,
      expect.objectContaining({ success: true }),
    );
  });
});
