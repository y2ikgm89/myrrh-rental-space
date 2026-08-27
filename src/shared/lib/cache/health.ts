/**
 * Startup Cloudflare credentials + tag purge health probe.
 *
 * Run once at cold start from instrumentation.register() (production only).
 *
 * 1. Validates credentials via getCloudflareCredentialsValidated (same Zone ID
 *    regex check as runtime — malformed Zone ID fires HIGH-severity logError).
 * 2. Issues a canary purge_by_tags against a sentinel tag.
 *
 * **失敗の扱いは種別で分ける。** この probe の目的は「認証情報とプランが
 * 正しいか」の確認であって、レイテンシの計測ではない。timeout やネットワーク
 * 失敗はその目的について何も語らないので HIGH で鳴らさない。
 *
 * 分けなかった結果どうなったかは実測済み: 7 日間で失敗 42 件 / 成功 3 件
 * （public 21/0, admin 19/2, cron 2/1）。ほぼ全てが timeout で、実行時 purge の
 * 失敗ログは 0 件だった。**HIGH が週 40 回空振りする状態は、本物の認証情報
 * 失効を隠す。**
 */

import "server-only";
import {
  getCloudflareCredentialsValidated,
  callPurgeApiPublic,
} from "@/shared/lib/cloudflare";
import { serverEnv } from "@/shared/lib/env/server";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";

const CANARY_TAG = "cdn-tag-purge-canary-v1";

export async function assertCloudflareCredentials(): Promise<void> {
  if (process.env["NODE_ENV"] !== "production") return;
  // Production-mode E2E runs `next start` without real Cloudflare credentials.
  // Avoid external startup side effects while still exercising production env
  // validation and routing behavior.
  if (serverEnv.E2E_RUNTIME === "1") return;

  try {
    const creds = getCloudflareCredentialsValidated();
    if (!creds) {
      logError(
        new Error(
          "Cloudflare credentials missing or malformed at startup — cache purges will silently no-op",
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            component: "cloudflare",
            phase: "instrumentation.register",
          },
        },
      );
      return;
    }

    // **実行時 purge と同じ条件で測る。** 既定の 10s + retry は
    // `callPurgeApiPublic` の既定値そのもの（`cloudflare.ts`）。
    //
    // 以前は「boot を止めないため」5s / retry 無しにしていたが、呼び出し元
    // (`instrumentation.ts`) は `void` で await していないので boot は元から
    // 止まらない。実際には起きない厳しい条件を測って鳴っていただけだった。
    const result = await callPurgeApiPublic(creds.zoneId, creds.apiToken, {
      tags: [CANARY_TAG],
    });

    if (result.success) {
      logger.info("Cloudflare tag purge supported on this plan");
      return;
    }

    if (result.transient) {
      // timeout / ネットワーク / 429 / 5xx。設定は壊れていないので HIGH に
      // しない。runtime の purge は同じ条件 + retry で走るため、ここが 1 回
      // 落ちたことは purge が壊れている証拠にならない。
      logger.warn(
        `Cloudflare tag purge startup canary could not complete: ${result.error ?? "unknown"}`,
      );
      return;
    }

    // 認証エラー / プラン非対応 / レスポンス不正 — **対応が要る。**
    logError(
      new Error(
        `Cloudflare tag purge startup canary failed. Cloudflare error: ${result.error ?? "unknown"}`,
      ),
      {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          component: "cloudflare",
          phase: "instrumentation.register",
          cloudflareError: result.error,
        },
      },
    );
  } catch (error) {
    logError(
      error instanceof Error
        ? error
        : new Error("Cloudflare credential probe failed"),
      {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          component: "cloudflare",
          phase: "instrumentation.register",
        },
      },
    );
  }
}
