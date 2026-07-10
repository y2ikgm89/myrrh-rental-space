/**
 * SwitchBot Webhook API Route Tests
 *
 * /api/webhooks/switchbot/[token] のテスト。google-calendar webhook route test
 * (__tests__/integration/api/webhooks/google-calendar.test.ts) と同じ流儀で
 * domain 層をモックし、Route Handler を直接呼び出す。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockGetSwitchBotWebhookAuth = mock<
  () => Promise<{ enabled: boolean; pathToken: string | null }>
>(() => Promise.resolve({ enabled: false, pathToken: null }));
const mockIsKnownSmartLockDevice = mock<
  (deviceMac: string) => Promise<boolean>
>(() => Promise.resolve(false));
const mockProcessSwitchBotChangeReport = mock<
  (payload: unknown) => Promise<boolean>
>(() => Promise.resolve(false));
const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getSwitchBotWebhookAuth: () => mockGetSwitchBotWebhookAuth(),
}));

mock.module("@/shared/domain/smart-lock/webhook-commands", () => ({
  isKnownSmartLockDevice: (deviceMac: string) =>
    mockIsKnownSmartLockDevice(deviceMac),
  processSwitchBotChangeReport: (payload: unknown) =>
    mockProcessSwitchBotChangeReport(payload),
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: mock(() => undefined),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: {
    VALIDATION: "VALIDATION",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
  },
}));

const EXPECTED_TOKEN = "expected-webhook-path-token";

const VALID_CONTEXT = {
  deviceMac: "AA:BB:CC:DD:EE:FF",
  eventName: "createKey",
  commandId: "cmd-1",
  result: "success" as const,
};

function switchbotRequest(body: unknown): Request {
  return new Request("http://localhost/api/webhooks/switchbot/some-token", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function post(request: Request, token: string): Promise<Response> {
  const routeModule =
    await import("@/app/api/webhooks/switchbot/[token]/route");
  return routeModule.POST(request, { params: Promise.resolve({ token }) });
}

describe("POST /api/webhooks/switchbot/[token]", () => {
  beforeEach(() => {
    mockGetSwitchBotWebhookAuth.mockReset();
    mockIsKnownSmartLockDevice.mockReset();
    mockProcessSwitchBotChangeReport.mockReset();
    mockLogError.mockReset();

    mockGetSwitchBotWebhookAuth.mockResolvedValue({
      enabled: true,
      pathToken: EXPECTED_TOKEN,
    });
    mockIsKnownSmartLockDevice.mockResolvedValue(false);
    mockProcessSwitchBotChangeReport.mockResolvedValue(false);
  });

  describe("トークン検証", () => {
    test("URLパストークンが一致しない場合は404を返す", async () => {
      const response = await post(
        switchbotRequest({ eventType: "changeReport", context: VALID_CONTEXT }),
        "wrong-token",
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Not found");
      expect(mockIsKnownSmartLockDevice).not.toHaveBeenCalled();
      expect(mockProcessSwitchBotChangeReport).not.toHaveBeenCalled();
    });

    test("webhookトークンが未設定(null)の場合も404を返す", async () => {
      mockGetSwitchBotWebhookAuth.mockResolvedValue({
        enabled: true,
        pathToken: null,
      });

      const response = await post(
        switchbotRequest({ eventType: "changeReport", context: VALID_CONTEXT }),
        EXPECTED_TOKEN,
      );

      expect(response.status).toBe(404);
    });

    test("トークンが正しくてもSwitchBot連携が無効(enabled:false)なら404を返す", async () => {
      mockGetSwitchBotWebhookAuth.mockResolvedValue({
        enabled: false,
        pathToken: EXPECTED_TOKEN,
      });

      const response = await post(
        switchbotRequest({ eventType: "changeReport", context: VALID_CONTEXT }),
        EXPECTED_TOKEN,
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Not found");
      expect(mockIsKnownSmartLockDevice).not.toHaveBeenCalled();
    });
  });

  describe("body 解析", () => {
    test("不正なJSONの場合は400を返す", async () => {
      const response = await post(
        switchbotRequest("not-json{{{"),
        EXPECTED_TOKEN,
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON");
      expect(mockIsKnownSmartLockDevice).not.toHaveBeenCalled();
    });

    test("スキーマに一致しないpayloadは200でhandled:falseを返す(未対応イベント無視)", async () => {
      const response = await post(
        switchbotRequest({ eventType: "changeReport", context: {} }),
        EXPECTED_TOKEN,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true, handled: false });
      expect(mockIsKnownSmartLockDevice).not.toHaveBeenCalled();
    });
  });

  describe("deviceMac 照合", () => {
    test("未知のdeviceMacの場合は200だがhandled:falseを返す", async () => {
      mockIsKnownSmartLockDevice.mockResolvedValue(false);

      const response = await post(
        switchbotRequest({ eventType: "changeReport", context: VALID_CONTEXT }),
        EXPECTED_TOKEN,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true, handled: false });
      expect(mockProcessSwitchBotChangeReport).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    test("登録済みdeviceMacの場合はprocessSwitchBotChangeReportを呼び出す", async () => {
      mockIsKnownSmartLockDevice.mockResolvedValue(true);
      mockProcessSwitchBotChangeReport.mockResolvedValue(true);

      const response = await post(
        switchbotRequest({ eventType: "changeReport", context: VALID_CONTEXT }),
        EXPECTED_TOKEN,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true, handled: true });
      expect(mockProcessSwitchBotChangeReport).toHaveBeenCalledWith({
        deviceMac: VALID_CONTEXT.deviceMac,
        eventName: VALID_CONTEXT.eventName,
        commandId: VALID_CONTEXT.commandId,
        result: VALID_CONTEXT.result,
      });
    });

    test("登録済みdeviceMacでもprocessSwitchBotChangeReportがfalseならhandled:falseを返す", async () => {
      mockIsKnownSmartLockDevice.mockResolvedValue(true);
      mockProcessSwitchBotChangeReport.mockResolvedValue(false);

      const response = await post(
        switchbotRequest({ eventType: "changeReport", context: VALID_CONTEXT }),
        EXPECTED_TOKEN,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true, handled: false });
    });
  });
});
