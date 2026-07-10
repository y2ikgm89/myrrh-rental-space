/**
 * SwitchBot OpenAPI v1.1 クライアントテスト
 *
 * `buildAuthHeaders` は非 export のため直接呼び出せない。そのため実装をコピーせず、
 * `globalThis.fetch` に渡された実際の init（url / method / headers）を捕捉し、
 * 送信された `t` / `nonce` を使って **このテストファイル独自の** `node:crypto`
 * `createHmac` 呼び出しで sign を再計算し、実装が送信した値と一致するかを検証する
 * （公式ドキュメント記載の `HMAC-SHA256(secretKey, token+t+nonce) -> base64` を
 * 別経路で再現する独立検証）。
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { createHmac } from "node:crypto";
import type {
  SwitchBotCredentials,
  CreatePasscodeParams,
} from "@/shared/lib/smart-lock/switchbot-client";

const CREDENTIALS: SwitchBotCredentials = {
  openToken: "test-open-token",
  secretKey: "test-secret-key",
};

const originalFetch = globalThis.fetch;
const fetchImpl = Object.assign(
  (_input: Parameters<typeof globalThis.fetch>[0], _init?: RequestInit) =>
    Promise.resolve(new Response()),
  { preconnect: originalFetch.preconnect },
);
const mockFetch = Object.assign(mock(fetchImpl), {
  preconnect: originalFetch.preconnect,
});

beforeEach(() => {
  globalThis.fetch = mockFetch;
  mockFetch.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function capturedInit(callIndex = 0): RequestInit {
  const call = mockFetch.mock.calls[callIndex];
  if (!call) throw new Error(`fetch was not called (index=${callIndex})`);
  const init = call[1];
  if (!init) throw new Error("fetch was called without an init object");
  return init;
}

function capturedHeaders(callIndex = 0): Record<string, string> {
  const init = capturedInit(callIndex);
  return init.headers as Record<string, string>;
}

/**
 * 送信された sign ヘッダーを「別経路」（このテストファイル自身の createHmac 呼出）で
 * 独立に再計算し、一致することを検証する。
 */
function expectValidAuthHeaders(
  headers: Record<string, string>,
  credentials: SwitchBotCredentials,
): void {
  expect(headers["Authorization"]).toBe(credentials.openToken);
  expect(headers["Content-Type"]).toBe("application/json; charset=utf8");

  const t = headers["t"];
  const nonce = headers["nonce"];
  expect(typeof t).toBe("string");
  expect(t).toMatch(/^\d+$/);
  expect(typeof nonce).toBe("string");
  expect(nonce.length).toBeGreaterThan(0);

  const expectedSign = createHmac("sha256", credentials.secretKey)
    .update(`${credentials.openToken}${t}${nonce}`, "utf8")
    .digest("base64");
  expect(headers["sign"]).toBe(expectedSign);
}

describe("switchbot-client", () => {
  describe("getDeviceList", () => {
    test("GET /devices を正しいURL・ヘッダーで呼び出し、成功時に body を返す", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          statusCode: 100,
          message: "success",
          body: { deviceList: [], infraredRemoteList: [] },
        }),
      );

      const { getDeviceList } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await getDeviceList(CREDENTIALS);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.switch-bot.com/v1.1/devices");
      expect(init.method ?? "GET").toBe("GET");
      expectValidAuthHeaders(capturedHeaders(), CREDENTIALS);

      expect(result).toEqual({
        ok: true,
        body: { deviceList: [], infraredRemoteList: [] },
      });
    });
  });

  describe("createPasscode", () => {
    test("POST /devices/:id/commands で createKey コマンドを送信する", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          statusCode: 100,
          body: { commandId: "cmd-1" },
        }),
      );

      const { createPasscode } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const params: CreatePasscodeParams = {
        deviceId: "device-mac-1",
        name: "res-12345678-abcdefgh",
        type: "timeLimit",
        password: "123456",
        startTime: 1_700_000_000,
        endTime: 1_700_003_600,
      };
      const result = await createPasscode(CREDENTIALS, params);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.switch-bot.com/v1.1/devices/device-mac-1/commands",
      );
      expect(init.method).toBe("POST");
      expectValidAuthHeaders(capturedHeaders(), CREDENTIALS);
      expect(JSON.parse(init.body as string)).toEqual({
        commandType: "command",
        command: "createKey",
        parameter: {
          name: "res-12345678-abcdefgh",
          type: "timeLimit",
          password: "123456",
          startTime: 1_700_000_000,
          endTime: 1_700_003_600,
        },
      });

      expect(result).toEqual({ ok: true, body: { commandId: "cmd-1" } });
    });
  });

  describe("getDeviceStatus", () => {
    test("GET /devices/:id/status で keyList を含む body を返す", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          statusCode: 100,
          body: {
            keyList: [
              {
                id: "key-1",
                name: "res-12345678-abcdefgh",
                type: "timeLimit",
                password: "enc",
                iv: "iv",
                status: "normal",
                createTime: 1_700_000_000,
              },
            ],
          },
        }),
      );

      const { getDeviceStatus } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await getDeviceStatus(CREDENTIALS, "device-mac-1");

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.switch-bot.com/v1.1/devices/device-mac-1/status",
      );
      expect(init.method ?? "GET").toBe("GET");
      expectValidAuthHeaders(capturedHeaders(), CREDENTIALS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body.keyList).toHaveLength(1);
        expect(result.body.keyList?.[0]?.id).toBe("key-1");
      }
    });
  });

  describe("deletePasscode", () => {
    test("POST /devices/:id/commands で deleteKey コマンドを送信する", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ statusCode: 100, body: {} }),
      );

      const { deletePasscode } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await deletePasscode(CREDENTIALS, "device-mac-1", "key-1");

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.switch-bot.com/v1.1/devices/device-mac-1/commands",
      );
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        commandType: "command",
        command: "deleteKey",
        parameter: { id: "key-1" },
      });
      expect(result).toEqual({ ok: true, body: {} });
    });
  });

  describe("setupWebhook / queryWebhookUrls / deleteWebhook", () => {
    test("setupWebhook は setupWebhook action + deviceList:ALL を送信する", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ statusCode: 100, body: {} }),
      );

      const { setupWebhook } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      await setupWebhook(CREDENTIALS, "https://example.com/webhook");

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.switch-bot.com/v1.1/webhook/setupWebhook");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        action: "setupWebhook",
        url: "https://example.com/webhook",
        deviceList: "ALL",
      });
    });

    test("queryWebhookUrls は queryUrl action を送信する", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          statusCode: 100,
          body: { urls: ["https://example.com/webhook"] },
        }),
      );

      const { queryWebhookUrls } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await queryWebhookUrls(CREDENTIALS);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.switch-bot.com/v1.1/webhook/queryWebhook");
      expect(JSON.parse(init.body as string)).toEqual({ action: "queryUrl" });
      expect(result).toEqual({
        ok: true,
        body: { urls: ["https://example.com/webhook"] },
      });
    });

    test("deleteWebhook は deleteWebhook action + url を送信する", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ statusCode: 100, body: {} }),
      );

      const { deleteWebhook } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      await deleteWebhook(CREDENTIALS, "https://example.com/webhook");

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.switch-bot.com/v1.1/webhook/deleteWebhook");
      expect(JSON.parse(init.body as string)).toEqual({
        action: "deleteWebhook",
        url: "https://example.com/webhook",
      });
    });
  });

  describe("エラーハンドリング", () => {
    test("statusCode !== 100 の場合は ok:false + statusCode/message を返す", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ statusCode: 190, message: "Invalid token" }),
      );

      const { getDeviceList } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await getDeviceList(CREDENTIALS);

      expect(result).toEqual({
        ok: false,
        statusCode: 190,
        message: "Invalid token",
      });
    });

    test("statusCode !== 100 でも message が空なら既定のエラーメッセージを返す", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ statusCode: 401 }));

      const { getDeviceList } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await getDeviceList(CREDENTIALS);

      expect(result).toEqual({
        ok: false,
        statusCode: 401,
        message: "SwitchBot API がエラーを返しました",
      });
    });

    test("レスポンス形式が envelope と一致しない場合は ok:false を返す", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ unexpected: "shape" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const { getDeviceList } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await getDeviceList(CREDENTIALS);

      expect(result).toEqual({
        ok: false,
        statusCode: 200,
        message: "SwitchBot API から予期しない形式の応答が返されました",
      });
    });

    test("fetch が例外を投げた場合は ok:false + statusCode:0 + エラーメッセージを返す", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network down"));

      const { getDeviceList } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await getDeviceList(CREDENTIALS);

      expect(result).toEqual({
        ok: false,
        statusCode: 0,
        message: "network down",
      });
    });

    test("fetch が Error 以外を投げた場合は「接続エラー」を返す", async () => {
      mockFetch.mockRejectedValueOnce("some string rejection");

      const { getDeviceList } =
        await import("@/shared/lib/smart-lock/switchbot-client");
      const result = await getDeviceList(CREDENTIALS);

      expect(result).toEqual({
        ok: false,
        statusCode: 0,
        message: "接続エラー",
      });
    });
  });
});
