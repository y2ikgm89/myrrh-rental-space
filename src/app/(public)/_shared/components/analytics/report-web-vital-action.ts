"use server";

/**
 * Consent-gated Web Vital sample → structured Cloud Logging.
 * No public /api/metrics write surface; browser calls this Server Action only.
 */

import { logger } from "@/shared/lib/errors/logger-core";

const ALLOWED_METRICS = new Set(["CLS", "INP", "LCP", "FCP", "TTFB"]);

export type WebVitalReport = {
  readonly name: string;
  readonly value: number;
};

/**
 * Persist one Web Vital sample as `message=web_vital` for log-based metrics.
 * Rejects unknown names and non-finite values (no URL / UA labels).
 */
export async function reportWebVitalAction(
  report: WebVitalReport,
): Promise<void> {
  if (!ALLOWED_METRICS.has(report.name)) {
    return;
  }
  if (!Number.isFinite(report.value)) {
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
