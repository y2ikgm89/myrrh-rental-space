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

export type SwitchBotPasscodeType =
  "permanent" | "timeLimit" | "disposable" | "urgent";

export type CreatePasscodeParams = {
  readonly deviceId: string;
  readonly name: string;
  readonly type: SwitchBotPasscodeType;
  /** 6〜12桁の数字（平文） */
  readonly password: string;
  /** timeLimit/disposable では必須。10桁Unixタイムスタンプ（秒） */
  readonly startTime?: number;
  readonly endTime?: number;
};

/**
 * パスコードを作成する（`createKey`）。
 *
 * 注意: 公式ドキュメントは機種（無印Keypad / Keypad Touch / Keypad Vision /
 * Keypad Vision Pro）によってリクエストボディの記載例が微妙に異なる（ドキュメント自体の
 * 揺れ）。本実装は「Send device control commands」の一般形式
 * `{commandType:"command", command:"createKey", parameter:{...}}` を全機種共通の
 * 正本として採用する（v1.1 APIの一般コマンド送信エンドポイントの標準形式のため）。
 * 実機での動作確認を推奨する。
 *
 * レスポンスの `commandId` はコマンド実行の相関確認用であり、パスコード自体のID
 * （`deleteKey`に必要な`keyId`）ではない。keyIdは`getDeviceStatus`の`keyList`から
 * `name`で突合して取得する（専用の取得APIが存在しないため）。
 */
export async function createPasscode(
  credentials: SwitchBotCredentials,
  { deviceId, ...parameter }: CreatePasscodeParams,
): Promise<SwitchBotApiResult<{ commandId: string }>> {
  return request(credentials, `/devices/${deviceId}/commands`, {
    method: "POST",
    body: { commandType: "command", command: "createKey", parameter },
  });
}

export type SwitchBotKeyListItem = {
  readonly id: string;
  readonly name: string;
  readonly type: SwitchBotPasscodeType;
  /** 暗号化された値（SwitchBot側の暗号化であり本アプリの`encrypt()`とは無関係） */
  readonly password: string;
  readonly iv: string;
  readonly status: "normal" | "expired";
  readonly createTime: number;
};

/**
 * デバイス状態を取得する。Keypad系デバイスの場合、`keyList`に発行済みパスコード
 * 一覧が含まれる（`createKey`の`name`で自分の発行分を突合するために使う）。
 */
export async function getDeviceStatus(
  credentials: SwitchBotCredentials,
  deviceId: string,
): Promise<SwitchBotApiResult<{ keyList?: SwitchBotKeyListItem[] }>> {
  return request(credentials, `/devices/${deviceId}/status`);
}

/**
 * パスコードを削除する（`deleteKey`）。`keyId`は`getDeviceStatus`の`keyList[].id`。
 */
export async function deletePasscode(
  credentials: SwitchBotCredentials,
  deviceId: string,
  keyId: string,
): Promise<SwitchBotApiResult<Record<string, never>>> {
  return request(credentials, `/devices/${deviceId}/commands`, {
    method: "POST",
    body: {
      commandType: "command",
      command: "deleteKey",
      parameter: { id: keyId },
    },
  });
}

/**
 * Webhook受信URLを登録する。SwitchBotは現状 `deviceList: "ALL"` のみサポート
 * （個別デバイス指定は不可）。
 */
export async function setupWebhook(
  credentials: SwitchBotCredentials,
  url: string,
): Promise<SwitchBotApiResult<Record<string, never>>> {
  return request(credentials, "/webhook/setupWebhook", {
    method: "POST",
    body: { action: "setupWebhook", url, deviceList: "ALL" },
  });
}

/** 登録済みWebhook URLの一覧を取得する。 */
export async function queryWebhookUrls(
  credentials: SwitchBotCredentials,
): Promise<SwitchBotApiResult<{ urls: string[] }>> {
  return request(credentials, "/webhook/queryWebhook", {
    method: "POST",
    body: { action: "queryUrl" },
  });
}

/** Webhook登録を解除する。 */
export async function deleteWebhook(
  credentials: SwitchBotCredentials,
  url: string,
): Promise<SwitchBotApiResult<Record<string, never>>> {
  return request(credentials, "/webhook/deleteWebhook", {
    method: "POST",
    body: { action: "deleteWebhook", url },
  });
}
