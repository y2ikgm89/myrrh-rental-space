/**
 * SwitchBot 実機検証プローブ（2026-08-16 公式準拠監査 Phase B-1）
 *
 * 公式 v1.1 仕様と実機（Keypad 系）の挙動のギャップを確定させるための
 * 読み書き検証スクリプト。本番コードを import しない — 公式 README の
 * サンプルから独立に実装し、本番クライアント実装の自己参照検証を避ける。
 *
 * 検証項目（docs/audits/2026-08-16-switchbot-official-compliance-audit.md S-1/S-7）:
 *   1. 認証署名の受理（GET /devices が statusCode 100 を返すか）
 *   2. createKey 応答 body に commandId が含まれるか
 *   3. createKey → Device List keyList 出現までの遅延（疎 poll 45s 設計の妥当性）
 *   4. deleteKey 応答 body の形式
 *   5. deleteKey → keyList 消失までの遅延
 *
 * 使い方（PowerShell 例）:
 *   $env:SWITCHBOT_OPEN_TOKEN="..."; $env:SWITCHBOT_SECRET_KEY="..."
 *   bun scripts/switchbot-live-probe.ts --list-only        # 認証 + デバイス列挙のみ
 *   bun scripts/switchbot-live-probe.ts --device <MAC>     # createKey/deleteKey 実機検証
 *   bun scripts/switchbot-live-probe.ts --cleanup --device <MAC>  # 残置 probe- key の一括削除
 *
 * 安全設計:
 *   - `probe-` 接頭辞の key のみ作成・削除する。既存 key には触れない
 *   - createKey した key は finally で必ず deleteKey する（冪等後始末）
 *   - keyList 反映が遅れて keyId を取得できず残置した場合は `--cleanup` で回収する
 *   - トークンは環境変数でのみ受け取り、ログにも出さない
 *
 * 注意: 日次 10,000 req/token の公式上限を消費する（1 回の実行で十数回程度）。
 */

import { createHmac, randomInt, randomUUID } from "node:crypto";
import { isRecord } from "@/shared/lib/serialize";

const API_BASE = "https://api.switch-bot.com/v1.1";
const REQUEST_TIMEOUT_MS = 10_000;
/** keyList 反映 poll のオフセット（ms）。本番の疎 poll 設計（45s）を超えた遅延も計測する */
const POLL_OFFSETS_MS = [
  0, 5_000, 15_000, 30_000, 45_000, 60_000, 90_000, 120_000,
] as const;

type KeyListItem = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type DeviceListItem = {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  keyList?: KeyListItem[];
};

/** envelope から statusCode を段階的に読む（as キャスト禁止の repo gate 準拠） */
function readStatusCode(envelope: Record<string, unknown>): number | undefined {
  const statusCode = envelope["statusCode"];
  return typeof statusCode === "number" ? statusCode : undefined;
}

function readMessage(envelope: Record<string, unknown>): string {
  const message = envelope["message"];
  return typeof message === "string" ? message : "";
}

function toKeyListItem(value: unknown): KeyListItem | null {
  if (!isRecord(value)) return null;
  const { id, name, type, status } = value;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof type !== "string" ||
    typeof status !== "string"
  ) {
    return null;
  }
  return { id, name, type, status };
}

function toDeviceListItem(value: unknown): DeviceListItem | null {
  if (!isRecord(value)) return null;
  const { deviceId, deviceName, deviceType, keyList } = value;
  if (
    typeof deviceId !== "string" ||
    typeof deviceName !== "string" ||
    typeof deviceType !== "string"
  ) {
    return null;
  }
  const parsedKeyList = Array.isArray(keyList)
    ? keyList
        .map(toKeyListItem)
        .filter((item): item is KeyListItem => item !== null)
    : undefined;
  return {
    deviceId,
    deviceName,
    deviceType,
    ...(parsedKeyList !== undefined ? { keyList: parsedKeyList } : {}),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が未設定です`);
    process.exit(1);
  }
  return value;
}

function buildAuthHeaders(token: string, secret: string): HeadersInit {
  // 公式 README の JS サンプル通り: HMAC-SHA256(token + t + nonce) → raw bytes の Base64
  const t = Date.now().toString();
  const nonce = randomUUID();
  const sign = createHmac("sha256", secret)
    .update(`${token}${t}${nonce}`, "utf8")
    .digest("base64");
  return {
    Authorization: token,
    sign,
    t,
    nonce,
    "Content-Type": "application/json; charset=utf8",
  };
}

async function callApi(
  token: string,
  secret: string,
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<{ httpStatus: number; envelope: Record<string, unknown> }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: buildAuthHeaders(token, secret),
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw: unknown = await response.json().catch(() => ({}));
  return { httpStatus: response.status, envelope: isRecord(raw) ? raw : {} };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function report(step: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ step, at: new Date().toISOString(), ...data }));
}

async function getDeviceList(
  token: string,
  secret: string,
): Promise<DeviceListItem[]> {
  const { httpStatus, envelope } = await callApi(token, secret, "/devices");
  if (readStatusCode(envelope) !== 100) {
    throw new Error(
      `GET /devices 失敗: http=${httpStatus} statusCode=${readStatusCode(envelope)} message=${readMessage(envelope)}`,
    );
  }
  const body = envelope["body"];
  if (!isRecord(body)) return [];
  const deviceList = body["deviceList"];
  if (!Array.isArray(deviceList)) return [];
  return deviceList
    .map(toDeviceListItem)
    .filter((item): item is DeviceListItem => item !== null);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list-only");
  const cleanupOnly = args.includes("--cleanup");
  const deviceFlagIndex = args.indexOf("--device");
  const targetDeviceId =
    deviceFlagIndex >= 0 ? args[deviceFlagIndex + 1] : undefined;

  const token = requireEnv("SWITCHBOT_OPEN_TOKEN");
  const secret = requireEnv("SWITCHBOT_SECRET_KEY");

  // 1. 認証 + デバイス列挙
  const devices = await getDeviceList(token, secret);
  report("auth.ok", { deviceCount: devices.length });
  const keypads = devices.filter((d) =>
    d.deviceType.toLowerCase().includes("keypad"),
  );
  report("devices.keypads", {
    keypads: keypads.map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      deviceType: d.deviceType,
      keyCount: d.keyList?.length ?? 0,
    })),
  });

  if (listOnly) return;

  const target = keypads.find((d) => d.deviceId === targetDeviceId);
  if (!target) {
    console.error(
      `--device に Keypad の deviceId を指定してください。候補: ${keypads.map((d) => d.deviceId).join(", ") || "(Keypad なし)"}`,
    );
    process.exit(1);
  }

  if (cleanupOnly) {
    // 残置した probe- key の回収（keyList 反映遅延で本検証が削除できなかった分）
    const leftovers = (target.keyList ?? []).filter((k) =>
      k.name.startsWith("probe-"),
    );
    if (leftovers.length === 0) {
      report("cleanup.none", { deviceId: target.deviceId });
      return;
    }
    for (const key of leftovers) {
      const result = await callApi(
        token,
        secret,
        `/devices/${target.deviceId}/commands`,
        {
          method: "POST",
          body: {
            commandType: "command",
            command: "deleteKey",
            parameter: { id: key.id },
          },
        },
      );
      report("cleanup.deleteKey", {
        keyId: key.id,
        name: key.name,
        httpStatus: result.httpStatus,
        statusCode: readStatusCode(result.envelope) ?? null,
        message: readMessage(result.envelope),
      });
    }
    return;
  }

  // 2. createKey
  const probeName = `probe-${Date.now().toString(36)}`;
  const probePassword = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const startTime = Math.floor(Date.now() / 1000) + 300;
  const endTime = startTime + 600;
  let createdKeyId: string | null = null;

  try {
    const createResponse = await callApi(
      token,
      secret,
      `/devices/${target.deviceId}/commands`,
      {
        method: "POST",
        body: {
          commandType: "command",
          command: "createKey",
          parameter: {
            name: probeName,
            type: "timeLimit",
            password: probePassword,
            startTime,
            endTime,
          },
        },
      },
    );
    // S-1 確定: body に commandId が含まれるか（含まれる場合の値も記録）
    const createBody = createResponse.envelope["body"];
    report("createKey.response", {
      httpStatus: createResponse.httpStatus,
      statusCode: readStatusCode(createResponse.envelope) ?? null,
      message: readMessage(createResponse.envelope),
      body: createBody ?? null,
      hasCommandId: isRecord(createBody) && "commandId" in createBody,
    });
    if (readStatusCode(createResponse.envelope) !== 100) {
      throw new Error("createKey が受理されませんでした");
    }

    // 3. keyList 出現までの遅延実測
    for (let i = 0; i < POLL_OFFSETS_MS.length; i++) {
      if (i > 0) {
        const currentOffset = POLL_OFFSETS_MS[i] ?? 0;
        const previousOffset = POLL_OFFSETS_MS[i - 1] ?? 0;
        await sleep(currentOffset - previousOffset);
      }
      const list = await getDeviceList(token, secret);
      const device = list.find((d) => d.deviceId === target.deviceId);
      const found = device?.keyList?.find((k) => k.name === probeName);
      if (found) {
        createdKeyId = found.id;
        report("createKey.keyListAppeared", {
          elapsedMs: POLL_OFFSETS_MS[i],
          keyId: found.id,
          keyType: found.type,
          keyStatus: found.status,
        });
        break;
      }
    }
    if (!createdKeyId) {
      report("createKey.keyListTimeout", {
        elapsedMs: POLL_OFFSETS_MS[POLL_OFFSETS_MS.length - 1] ?? 0,
      });
      return;
    }

    // 4. deleteKey
    const deleteResponse = await callApi(
      token,
      secret,
      `/devices/${target.deviceId}/commands`,
      {
        method: "POST",
        body: {
          commandType: "command",
          command: "deleteKey",
          parameter: { id: createdKeyId },
        },
      },
    );
    report("deleteKey.response", {
      httpStatus: deleteResponse.httpStatus,
      statusCode: readStatusCode(deleteResponse.envelope) ?? null,
      message: readMessage(deleteResponse.envelope),
      body: deleteResponse.envelope["body"] ?? null,
    });

    // 5. keyList 消失確認
    for (let i = 0; i < POLL_OFFSETS_MS.length; i++) {
      if (i > 0) {
        const currentOffset = POLL_OFFSETS_MS[i] ?? 0;
        const previousOffset = POLL_OFFSETS_MS[i - 1] ?? 0;
        await sleep(currentOffset - previousOffset);
      }
      const list = await getDeviceList(token, secret);
      const device = list.find((d) => d.deviceId === target.deviceId);
      const stillThere = device?.keyList?.some((k) => k.id === createdKeyId);
      if (!stillThere) {
        report("deleteKey.keyListDisappeared", {
          elapsedMs: POLL_OFFSETS_MS[i],
        });
        createdKeyId = null;
        break;
      }
    }
    if (createdKeyId) {
      report("deleteKey.keyListTimeout", {
        elapsedMs: POLL_OFFSETS_MS[POLL_OFFSETS_MS.length - 1] ?? 0,
        note: "key が残っています。SwitchBot アプリから手動削除してください",
      });
    }
  } finally {
    // 後始末: 作成済みで未削除の key があれば deleteKey を再試行
    if (createdKeyId) {
      const cleanup = await callApi(
        token,
        secret,
        `/devices/${target.deviceId}/commands`,
        {
          method: "POST",
          body: {
            commandType: "command",
            command: "deleteKey",
            parameter: { id: createdKeyId },
          },
        },
      );
      report("cleanup.deleteKey", {
        statusCode: readStatusCode(cleanup.envelope) ?? null,
        keyId: createdKeyId,
      });
    }
  }
}

try {
  await main();
  console.log("probe 完了");
} catch (error) {
  console.error(
    "probe 失敗:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
