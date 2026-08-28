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
 * 分けなかった結果どうなったかは実測済み: 対応の取れた 46 回の起動のうち
 * 42 回が `TimeoutError` で HIGH を出していた（成功 4 回 = 8.7%）。実行時 purge の
 * 失敗ログは 0 件。**HIGH が週 40 回空振りする状態は、本物の認証情報失効を隠す。**
 *
 * その timeout が何を測っていたかは `CANARY_ABORT_BUDGET_MS` を参照。
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

/**
 * canary purge の**操作全体**の期限。retry と backoff sleep もこの中で回る。
 *
 * **これは「Cloudflare が何秒で返すべきか」ではなく「この観測に何秒使ってよいか」。**
 * canary は `instrumentation.register()` から `void` で撃たれるので boot を
 * 待たせない（監査 F-72）。待たせない以上、予算を切り詰めて得られるものは無い。
 *
 * かつてここは `retry: false` とセットだった。retry を止めていたのは
 * 「Retry-After の sleep が signal で切れないので、retry を許すと起動直後の
 * インスタンスが分単位で待ちうる」ためで、canary 固有の事情ではない。
 * `cloudflare.ts` の sleep が期限で切れるようになったので、この予算が
 * そのまま待機の上限になり、公式推奨の exponential backoff retry を
 * canary でも普通に回せる。
 *
 * 5 秒だと **Cloudflare ではなく cold start の event loop 輻輳を測っていた**。
 * 実測（2026-08-20〜27 / Cloud Logging）: Next.js の "Ready" から canary の結果ログ
 * までが 3.38〜11.81 秒に散り、対応の取れた 46 回のうち 42 回が `TimeoutError` で
 * HIGH severity を出していた。Cloudflare 側の遅延では説明が付かない:
 *
 * - 同じ秒に起動した public と admin で、片方だけ成功する回が 2 度ある。
 * - 成功側に「Ready から 6.62 秒後」が含まれる。5 秒タイマーが 1.6 秒以上遅れて
 *   発火している = single vCPU の boot に timer も fetch も飢えており、
 *   どちらが先に event loop に戻るかの競争になっていた。
 *
 * 予算を伸ばすと、この競争がそもそも起きない。30 秒は実測最悪値 11.81 秒の約 2.5 倍で、
 * Cloud Run の startup probe 予算（period 10s × failure_threshold 9 = 90 秒）にも収まる。
 */
export const CANARY_ABORT_BUDGET_MS = 30_000;

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

    // Observation only。渡すのは**期限だけ**で、retry 方針は実行時 purge と
    // 共通（公式推奨の exponential backoff）。boot をブロックしない保証は
    // `instrumentation.register()` 側の `void` と、この期限が担う。
    const result = await callPurgeApiPublic(
      creds.zoneId,
      creds.apiToken,
      {
        tags: [CANARY_TAG],
      },
      { signal: AbortSignal.timeout(CANARY_ABORT_BUDGET_MS) },
    );

    if (result.success) {
      logger.info("Cloudflare tag purge supported on this plan");
      return;
    }

    if (result.transient) {
      // timeout / ネットワーク / 429 / 5xx。設定は壊れていないので HIGH に
      // しない。実測 42 件の失敗が全て timeout で、しかも Cloudflare ではなく
      // cold start の event loop 輻輳を測っていた（`CANARY_ABORT_BUDGET_MS`）。
      // ここが 1 回落ちたことは purge が壊れている証拠にならない。
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
