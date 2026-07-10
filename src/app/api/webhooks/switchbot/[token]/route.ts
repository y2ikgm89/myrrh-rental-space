/**
 * SwitchBot Webhook API
 *
 * SwitchBotからの`createKey`実行結果（changeReportイベント）を受信し、
 * パスコードの確定/失敗を早期反映する（主経路はポーリング、本経路は高速パス）。
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
import { getDecryptedSwitchBotWebhookPathToken } from "@/shared/domain/settings/api-key-queries";
import {
  isKnownSmartLockDevice,
  processSwitchBotChangeReport,
} from "@/shared/domain/smart-lock/webhook-commands";
import { timingSafeEqualStrings } from "@/shared/lib/timing-safe";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

const changeReportSchema = z.object({
  eventType: z.string(),
  context: z.object({
    deviceMac: z.string(),
    eventName: z.string(),
    commandId: z.string(),
    result: z.enum(["success", "failed", "timeout"]),
  }),
});

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;

    const expectedToken = await getDecryptedSwitchBotWebhookPathToken();
    if (!expectedToken || !timingSafeEqualStrings(token, expectedToken)) {
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

    const parsed = changeReportSchema.safeParse(raw);
    if (!parsed.success) {
      // createKey以外のchangeReport種別など、未対応イベントは無視して200を返す
      return jsonSuccess({ received: true, handled: false });
    }

    const { deviceMac, eventName, commandId, result } = parsed.data.context;

    const known = await isKnownSmartLockDevice(deviceMac);
    if (!known) {
      logError(new Error("Unknown deviceMac in SwitchBot webhook"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "switchbotWebhook", deviceMac },
      });
      return jsonSuccess({ received: true, handled: false });
    }

    const handled = await processSwitchBotChangeReport({
      deviceMac,
      eventName,
      commandId,
      result,
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
