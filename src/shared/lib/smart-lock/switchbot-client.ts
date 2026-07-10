/**
 * SwitchBot OpenAPI v1.1 クライアント
 *
 * 認証は `Authorization`(token) + `sign`(HMAC-SHA256) + `t`(13桁ms timestamp) +
 * `nonce`(UUID) の4ヘッダー。`sign` は `token+t+nonce` を単純連結した文字列を
 * secret keyで HMAC-SHA256 し、Base64エンコードしたもの（大文字化は公式サンプル間で
 * 一致しておらず本実装では行わない — Python/JS公式サンプルに準拠）。
 *
 * @see https://github.com/OpenWonderLabs/SwitchBotAPI
 * @module shared/lib/smart-lock/switchbot-client
 */

import "server-only";
import { createHmac, randomUUID } from "crypto";
import { z } from "zod";

const API_BASE = "https://api.switch-bot.com/v1.1";
const REQUEST_TIMEOUT_MS = 10_000;

export type SwitchBotCredentials = {
  readonly openToken: string;
  readonly secretKey: string;
};

export type SwitchBotApiResult<T> =
  | { readonly ok: true; readonly body: T }
  | {
      readonly ok: false;
      readonly statusCode: number;
      readonly message: string;
    };

const envelopeSchema = z.object({
  statusCode: z.number(),
  body: z.unknown().optional(),
  message: z.string().optional(),
});

function buildAuthHeaders(credentials: SwitchBotCredentials): HeadersInit {
  const t = Date.now().toString();
  const nonce = randomUUID();
  const stringToSign = `${credentials.openToken}${t}${nonce}`;
  const sign = createHmac("sha256", credentials.secretKey)
    .update(stringToSign, "utf8")
    .digest("base64");

  return {
    Authorization: credentials.openToken,
    sign,
    t,
    nonce,
    "Content-Type": "application/json; charset=utf8",
  };
}

async function request<T>(
  credentials: SwitchBotCredentials,
  path: string,
  init?: { readonly method?: "GET" | "POST"; readonly body?: unknown },
): Promise<SwitchBotApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: buildAuthHeaders(credentials),
      ...(init?.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const raw: unknown = await response.json();
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: response.status,
        message: "SwitchBot API から予期しない形式の応答が返されました",
      };
    }

    if (parsed.data.statusCode !== 100) {
      return {
        ok: false,
        statusCode: parsed.data.statusCode,
        message: parsed.data.message || "SwitchBot API がエラーを返しました",
      };
    }

    return { ok: true, body: parsed.data.body as T };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      message: error instanceof Error ? error.message : "接続エラー",
    };
  }
}

export type SwitchBotDeviceListItem = {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly deviceType: string;
  readonly enableCloudService: boolean;
  readonly hubDeviceId: string;
};

/**
 * 登録済みデバイス一覧を取得する。Open Token / Secret Key の疎通確認、および
 * 管理画面でのデバイス選択UIに使う。
 */
export async function getDeviceList(credentials: SwitchBotCredentials): Promise<
  SwitchBotApiResult<{
    deviceList: SwitchBotDeviceListItem[];
    infraredRemoteList: unknown[];
  }>
> {
  return request(credentials, "/devices");
}
