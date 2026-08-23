"use client";

/**
 * Web Vitals Reporter
 *
 * Core Web Vitals（CLS, INP, LCP）+ 補助指標（FCP, TTFB）を計測。
 * - GA4 が有効な場合は gtag() に送信
 * - 同意後は Server Action で構造化ログ `web_vital` も送る（Cloud Monitoring log-based metric）
 *
 * GDPR対応: cookieConsentEnabled 時は同意後のみ計測（AnalyticsProvider と同条件）
 *
 * @see https://web.dev/articles/vitals
 */

import { useEffect } from "react";
import { useAnalyticsConsent } from "@/public/components/analytics/use-analytics-consent";
import { logger } from "@/shared/lib/errors/logger-core";
import { reportWebVitalAction } from "@/public/actions/web-vital";

/**
 * gtag がグローバルに存在するか型安全にチェック
 * @next/third-parties の GoogleAnalytics が注入する
 */
function getGtag(): typeof globalThis.gtag | null {
  if (typeof globalThis.gtag === "function") {
    return globalThis.gtag;
  }
  return null;
}

/**
 * Web Vitals メトリクスを送信
 */
function sendMetric(metric: {
  name: string;
  delta: number;
  value: number;
  id: string;
}) {
  const gtag = getGtag();

  if (gtag) {
    gtag("event", metric.name, {
      value: metric.delta,
      metric_id: metric.id,
      metric_value: metric.value,
      metric_delta: metric.delta,
    });
  } else {
    logger.debug(`[Web Vitals] ${metric.name}`, {
      value: Math.round(metric.value),
    });
  }

  void reportWebVitalAction({
    name: metric.name,
    value: metric.value,
  }).catch(() => {
    // Best-effort observability; never break the page on report failure.
  });
}

interface WebVitalsReporterProps {
  /** Admin setting: when false, vitals run without prior banner accept. */
  cookieConsentEnabled: boolean;
}

/**
 * 計測の起動条件は **同意だけ**（監査 A-31）。
 *
 * 以前は GA4 の種別が未設定（`analyticsType === null`）なら早期 return しており、
 * `reportWebVitalAction` も一切呼ばれなかった。terraform で作っている
 * `web_vitals` DISTRIBUTION metric の emit 元はこの Server Action だけなので、
 * GA4 を使わない方針にした瞬間から metric が永久に空になる。
 * slo.md は条件として同意しか書いておらず、運用者は「同意率が低いのだろう」と
 * 誤解する（LCP が 2.5s → 6s に悪化しても気づかない）。
 *
 * GA4 への送信は `sendMetric` 内で `gtag` の有無を見て分岐するので、
 * ここで GA4 設定を見る必要はない。GA4 と自前 metric は独立した送信先。
 */
export function WebVitalsReporter({
  cookieConsentEnabled,
}: WebVitalsReporterProps) {
  const shouldLoadAnalytics = useAnalyticsConsent(cookieConsentEnabled);

  useEffect(() => {
    if (!shouldLoadAnalytics && process.env["NODE_ENV"] !== "development") {
      return;
    }

    void import("web-vitals").then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      onCLS(sendMetric);
      onINP(sendMetric);
      onLCP(sendMetric);
      onFCP(sendMetric);
      onTTFB(sendMetric);
    });
  }, [shouldLoadAnalytics]);

  return null;
}
