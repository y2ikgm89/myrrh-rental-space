/**
 * SwitchBot Webhook API
 *
 * SwitchBotからの changeReport イベントを受信する。
 * - createKey / deleteKey コマンド結果: webhook が成否の正本
 * - lockState: 錠デバイスの施錠状態・電池更新
 *
 * keyId 物質化は Device List keyList 突合（domain 層）。Device List 疎 poll は
 * webhook 遅延時の楽観確定の副経路。
 *
 * SwitchBotはinbound webhookの署名検証機構を公式に提供していないため、
 * ①URLパスの推測困難なトークン（`switchbotWebhookPathToken`、timing-safe比較）
 * ②payloadの`deviceMac`が自テナント登録済みデバイスと一致すること
 * の二重防御で代替する。
 *
 * @module api/webhooks/switchbot
 */

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getSwitchBotWebhookAuth } from "@/shared/domain/settings/api-key-queries";
import {
  isKnownSmartLockDevice,
  processSwitchBotChangeReport,
  processSwitchBotLockStateReport,
} from "@/shared/domain/smart-lock/webhook-commands";
import { timingSafeEqualStrings } from "@/shared/lib/timing-safe";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { isRecord } from "@/shared/lib/serialize";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

const commandResultContextSchema = z.object({
  deviceMac: z.string(),
  eventName: z.string(),
  commandId: z.string().optional(),
  /** deleteKey 相関用。commandId 欠落時のフォールバック */
  keyName: z.string().optional(),
  result: z.enum(["success", "failed", "timeout"]),
});

const lockStateContextSchema = z.object({
  deviceMac: z.string(),
  lockState: z.string(),
  battery: z.number().int().min(0).max(100).optional(),
  timeOfSample: z.number().optional(),
  deviceType: z.string().optional(),
});

type ChangeReport =
  | {
      readonly kind: "command";
      readonly eventType: "changeReport";
      readonly context: z.infer<typeof commandResultContextSchema>;
    }
  | {
      readonly kind: "lockState";
      readonly eventType: "changeReport";
      readonly context: z.infer<typeof lockStateContextSchema>;
    };

function parseChangeReport(raw: unknown): ChangeReport | null {
  if (!isRecord(raw)) return null;
  if (raw["eventType"] !== "changeReport") return null;
  const rawContext = raw["context"];
  if (!isRecord(rawContext)) return null;

  const context = rawContext;

  if (typeof context["lockState"] === "string") {
    const parsed = lockStateContextSchema.safeParse(context);
    if (!parsed.success) return null;
    return {
      kind: "lockState",
      eventType: "changeReport",
      context: parsed.data,
    };
  }

  const resultValue = context["result"];
  if (
    typeof context["eventName"] === "string" &&
    (resultValue === "success" ||
      resultValue === "failed" ||
      resultValue === "timeout")
  ) {
    const parsed = commandResultContextSchema.safeParse(context);
    if (!parsed.success) return null;
    return {
      kind: "command",
      eventType: "changeReport",
      context: parsed.data,
    };
  }

  return null;
}

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;

    const { enabled, pathToken } = await getSwitchBotWebhookAuth();
    if (!enabled || !pathToken || !timingSafeEqualStrings(token, pathToken)) {
      return jsonError("Not found", 404);
    }

    // bodyアクセス自体が動的化のトリガーになるため connection() は不要
    // （api/webhooks/stripe/route.ts と同じ判断）。
    const body = await request.text();

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return jsonError("Invalid JSON", 400);
    }

    const parsed = parseChangeReport(raw);
    if (!parsed) {
      return jsonSuccess({ received: true, handled: false });
    }

    const { deviceMac } = parsed.context;

    const known = await isKnownSmartLockDevice(deviceMac);
    if (!known) {
      logError(new Error("Unknown deviceMac in SwitchBot webhook"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "switchbotWebhook", deviceMac },
      });
      return jsonSuccess({ received: true, handled: false });
    }

    if (parsed.kind === "lockState") {
      const { lockState, battery, timeOfSample } = parsed.context;
      const handled = await processSwitchBotLockStateReport({
        deviceMac,
        lockState,
        ...(battery !== undefined ? { battery } : {}),
        ...(timeOfSample !== undefined ? { timeOfSample } : {}),
      });
      return jsonSuccess({ received: true, handled });
    }

    const { eventName, commandId, keyName, result } = parsed.context;
    const handled = await processSwitchBotChangeReport({
      deviceMac,
      eventName: eventName.trim(),
      result,
      ...(commandId !== undefined ? { commandId } : {}),
      ...(keyName !== undefined ? { keyName } : {}),
    });

    return jsonSuccess({ received: true, handled });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "switchbotWebhook" },
    });
    return jsonError("Webhook processing failed", 500);
  }
}
