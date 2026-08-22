"use server";

/**
 * Consent-gated Web Vital sample → structured Cloud Logging.
 * No public /api/metrics write surface; browser calls this Server Action only.
 *
 * ## 置き場所（監査 A-49）
 *
 * 以前は `_shared/components/analytics/` にあった。`public-mutation-guard-order`
 * gate の走査根は `_shared/actions` 固定なので、**公開 mutation なのに検査対象外**
 * だった。ここへ移すことで gate の SSoT に載る。
 *
 * ## なぜ rate limit が要るか
 *
 * proxy の rate limit は Server Action の POST に届かない（`src/proxy.ts` は
 * `/api` と `/admin/api/` の path prefix にしか `checkRateLimit` を持たず、
 * Server Action はページ path への POST + `Next-Action` ヘッダ）。同意判定は
 * client 側（`web-vitals-reporter.tsx` の `useAnalyticsConsent`）にしか無い。
 *
 * つまり RSC ペイロードから action ID を取れば、誰でも無制限に 1 リクエスト =
 * 1 行の構造化ログを書き込めた。ログ取り込み課金が増えるだけでなく、
 * `message=web_vital` から作る log-based metric の分布を任意値で汚染できる。
 */

import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { webVitalReportRateLimiter } from "@/shared/lib/rate-limit";
import { logger } from "@/shared/lib/errors/logger-core";

const ALLOWED_METRICS = new Set(["CLS", "INP", "LCP", "FCP", "TTFB"]);

/**
 * 指標ごとの上限。超えた値は破棄する（監査 A-49）。
 *
 * 実測としてありえない大きさのサンプルを 1 件混ぜるだけで、DISTRIBUTION の
 * p95 は実態と無関係な値になる。上限は「遅すぎて計測する意味が無い」水準に置く。
 *
 * CLS は無次元（通常 < 1）で、下の `* 1000` 前の生値に対する上限。
 */
const METRIC_VALUE_LIMITS: Record<string, number> = {
  LCP: 60_000,
  FCP: 60_000,
  TTFB: 60_000,
  INP: 60_000,
  CLS: 10,
};

export type WebVitalReport = {
  readonly name: string;
  readonly value: number;
};

/**
 * Persist one Web Vital sample as `message=web_vital` for log-based metrics.
 * Rejects unknown names, non-finite values, out-of-range values, and callers
 * over the per-IP budget (no URL / UA labels).
 */
export async function reportWebVitalAction(
  report: WebVitalReport,
): Promise<void> {
  if (!ALLOWED_METRICS.has(report.name)) {
    return;
  }
  if (!Number.isFinite(report.value) || report.value < 0) {
    return;
  }

  const limit = METRIC_VALUE_LIMITS[report.name];
  if (limit === undefined || report.value > limit) {
    return;
  }

  const rateLimit = await checkActionRateLimit(webVitalReportRateLimiter);
  if (!rateLimit.success) {
    return;
  }

  logger.info("web_vital", {
    metric: report.name,
    // CLS is unitless (often < 1); store as millis-scale integer via *1000 for
    // DISTRIBUTION extractors that expect numeric payload.
    value:
      report.name === "CLS"
        ? Math.round(report.value * 1000)
        : Math.round(report.value),
  });
}
