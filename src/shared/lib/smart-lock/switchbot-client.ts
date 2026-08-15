/**
 * SwitchBot OpenAPI v1.1 クライアント
 *
 * 認証は `Authorization`(token) + `sign`(HMAC-SHA256) + `t`(13桁ms timestamp) +
 * `nonce`(UUID) の4ヘッダー。`sign` は `token+t+nonce` を単純連結した文字列を
 * secret keyで HMAC-SHA256 し、Base64エンコードしたもの（大文字化は公式サンプル間で
 * 一致しておらず本実装では行わない — Python/JS公式サンプルに準拠）。
 *
 * keyId の SSoT は Device List (`GET /devices`) の `keyList`。コマンド成否
 * （createKey / deleteKey）は webhook を正本とし、Device List は keyId 物質化の
 * 副経路（疎 poll）として使う。
 *
 * @see https://github.com/OpenWonderLabs/SwitchBotAPI
 * @module shared/lib/smart-lock/switchbot-client
 */

import "server-only";
import { createHmac, randomUUID } from "crypto";
import { z } from "zod";

const API_BASE = "https://api.switch-bot.com/v1.1";
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_DEVICE_LIST_CACHE_TTL_MS = 3_000;

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

type DeviceListBody = {
  deviceList: SwitchBotDeviceListItem[];
  infraredRemoteList: unknown[];
};

type DeviceListCacheEntry = {
  readonly expiresAt: number;
  readonly result: SwitchBotApiResult<DeviceListBody>;
};

const deviceListCache = new Map<string, DeviceListCacheEntry>();

function deviceListCacheKey(credentials: SwitchBotCredentials): string {
  return credentials.openToken.slice(0, 16);
}

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

    // Official spec: HTTP 401 `{"message":"Unauthorized"}` has no statusCode.
    // Invalid Open Token and daily 10,000-request/token exhaustion both return
    // this shape; parse it before envelopeSchema so logs are not "unexpected form".
    // @see https://github.com/OpenWonderLabs/SwitchBotAPI#request-limit
    if (response.status === 401) {
      return {
        ok: false,
        statusCode: 401,
        message:
          "SwitchBot API 認証エラー（Open Token 無効または日次リクエスト上限 10,000 件超過）",
      };
    }

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

export type SwitchBotPasscodeType =
  "permanent" | "timeLimit" | "disposable" | "urgent";

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

export type SwitchBotDeviceListItem = {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly deviceType: string;
  readonly enableCloudService: boolean;
  readonly hubDeviceId: string;
  /** Keypad 系デバイスに含まれる発行済みパスコード一覧（Device List のみ） */
  readonly keyList?: SwitchBotKeyListItem[];
  /** Keypad がペアリングしている錠デバイスの MAC（Device List のみ） */
  readonly lockDeviceId?: string;
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

/**
 * プロセス内 TTL キャッシュ付きの Device List 取得。
 * createKey / deleteKey 確定待ちの疎 poll で `/devices` 呼び出しを畳む。
 */
export async function getDeviceListCached(
  credentials: SwitchBotCredentials,
  options?: { readonly ttlMs?: number },
): Promise<
  SwitchBotApiResult<{
    deviceList: SwitchBotDeviceListItem[];
    infraredRemoteList: unknown[];
  }>
> {
  const ttlMs = options?.ttlMs ?? DEFAULT_DEVICE_LIST_CACHE_TTL_MS;
  const cacheKey = deviceListCacheKey(credentials);
  const now = Date.now();
  const cached = deviceListCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const result = await getDeviceList(credentials);
  // 失敗結果はキャッシュしない（一時障害やテスト間の汚染を避ける）
  if (result.ok) {
    deviceListCache.set(cacheKey, { expiresAt: now + ttlMs, result });
  }
  return result;
}

/** テスト・資格情報ローテーション後に process-local Device List キャッシュを捨てる。 */
export function clearDeviceListCache(): void {
  deviceListCache.clear();
}

function findDeviceInList(
  deviceList: readonly SwitchBotDeviceListItem[],
  deviceId: string,
): SwitchBotDeviceListItem | undefined {
  return deviceList.find((device) => device.deviceId === deviceId);
}

/**
 * SwitchBot Device List / webhook の `deviceType` 文字列から pad / lock 家族を判定する。
 * Device List は "Keypad" / "Smart Lock Pro"、webhook は "WoKeypad" / "WoLockPro" など表記が揺れる。
 */
export function resolveSwitchBotDeviceFamily(
  switchBotDeviceType: string,
): "pad" | "lock" | null {
  const normalized = switchBotDeviceType.trim().toLowerCase();
  if (normalized.includes("keypad")) return "pad";
  if (normalized.includes("lock")) return "lock";
  return null;
}

/**
 * Device List から `deviceId` の 1 件を取得する（登録時の存在確認用）。
 */
export async function findDeviceInDeviceList(
  credentials: SwitchBotCredentials,
  deviceId: string,
): Promise<SwitchBotApiResult<SwitchBotDeviceListItem | null>> {
  const listResult = await getDeviceListCached(credentials);
  if (!listResult.ok) {
    return listResult;
  }
  const device = findDeviceInList(listResult.body.deviceList, deviceId);
  return { ok: true, body: device ?? null };
}

/**
 * Device List から `name` でパスコードを突合する。keyId 解決の SSoT。
 */
export async function findKeyInDeviceList(
  credentials: SwitchBotCredentials,
  deviceId: string,
  name: string,
): Promise<SwitchBotApiResult<SwitchBotKeyListItem | null>> {
  const listResult = await getDeviceListCached(credentials);
  if (!listResult.ok) {
    return listResult;
  }

  const device = findDeviceInList(listResult.body.deviceList, deviceId);
  const key = device?.keyList?.find((item) => item.name === name) ?? null;
  return { ok: true, body: key };
}

/**
 * Device List から `keyId` でパスコードを突合する（revoke 失効確認等）。
 */
export async function findKeyByIdInDeviceList(
  credentials: SwitchBotCredentials,
  deviceId: string,
  keyId: string,
): Promise<SwitchBotApiResult<SwitchBotKeyListItem | null>> {
  const listResult = await getDeviceListCached(credentials);
  if (!listResult.ok) {
    return listResult;
  }

  const device = findDeviceInList(listResult.body.deviceList, deviceId);
  const key = device?.keyList?.find((item) => item.id === keyId) ?? null;
  return { ok: true, body: key };
}

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
 * レスポンスの `commandId` は webhook 相関用。コマンド成否は webhook を正本とする。
 * keyId は Device List の `keyList` から `name` で突合して取得する。
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

export type SwitchBotLockDeviceStatus = {
  readonly lockState?: string;
  readonly doorState?: string;
  readonly battery?: number;
};

/**
 * 錠デバイス（Lock / Lock Lite / Lock Pro）の施錠・ドア・電池状態を取得する。
 *
 * keyList は Status API に含まれないため本関数では返さない。パスコード keyId 解決は
 * Device List の `findKeyInDeviceList` / `findKeyByIdInDeviceList` を使う。
 */
export async function getLockDeviceStatus(
  credentials: SwitchBotCredentials,
  deviceId: string,
): Promise<SwitchBotApiResult<SwitchBotLockDeviceStatus>> {
  const result = await request<Record<string, unknown>>(
    credentials,
    `/devices/${deviceId}/status`,
  );
  if (!result.ok) {
    return result;
  }

  const body = result.body;
  const lockState = body["lockState"];
  const doorState = body["doorState"];
  const battery = body["battery"];
  return {
    ok: true,
    body: {
      ...(typeof lockState === "string" ? { lockState } : {}),
      ...(typeof doorState === "string" ? { doorState } : {}),
      ...(typeof battery === "number" ? { battery } : {}),
    },
  };
}

/**
 * パスコードを削除する（`deleteKey`）。`keyId` は Device List の `keyList[].id`。
 *
 * コマンド成否は webhook を正本とする。`commandId` は webhook 相関用（body に
 * 無ければ undefined）。
 */
export async function deletePasscode(
  credentials: SwitchBotCredentials,
  deviceId: string,
  keyId: string,
): Promise<SwitchBotApiResult<{ commandId?: string }>> {
  const result = await request<{ commandId?: string } | Record<string, never>>(
    credentials,
    `/devices/${deviceId}/commands`,
    {
      method: "POST",
      body: {
        commandType: "command",
        command: "deleteKey",
        parameter: { id: keyId },
      },
    },
  );
  if (!result.ok) {
    return result;
  }

  const commandId =
    typeof result.body === "object" &&
    result.body !== null &&
    "commandId" in result.body &&
    typeof result.body.commandId === "string"
      ? result.body.commandId
      : undefined;

  return { ok: true, body: commandId !== undefined ? { commandId } : {} };
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
