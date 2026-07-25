"use client";

/**
 * Web Vitals Reporter
 *
 * Core Web Vitals（CLS, INP, LCP）+ 補助指標（FCP, TTFB）を計測。
 * GA4 が有効な場合は gtag() に送信。無効な場合は開発コンソールに出力。
 *
 * GDPR対応: cookieConsentEnabled 時は同意後のみ計測（AnalyticsProvider と同条件）
 *
 * @see https://web.dev/articles/vitals
 */

import { useEffect } from "react";
import { useAnalyticsConsent } from "@/public/components/analytics/use-analytics-consent";
import { logger } from "@/shared/lib/errors/logger-core";

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
    // GA4 に送信
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
}

interface WebVitalsReporterProps {
  /** GA4 が有効かどうか（Analytics設定から） */
  enabled: boolean;
  /** Admin setting: when false, vitals run without prior banner accept. */
  cookieConsentEnabled: boolean;
}

export function WebVitalsReporter({
  enabled,
  cookieConsentEnabled,
}: WebVitalsReporterProps) {
  const shouldLoadAnalytics = useAnalyticsConsent(cookieConsentEnabled);

  useEffect(() => {
    if (!shouldLoadAnalytics && process.env["NODE_ENV"] !== "development") {
      return;
    }

    if (!enabled && process.env["NODE_ENV"] !== "development") {
      return;
    }

    // web-vitals を動的 import（コード分割）
    void import("web-vitals").then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      onCLS(sendMetric);
      onINP(sendMetric);
      onLCP(sendMetric);
      onFCP(sendMetric);
      onTTFB(sendMetric);
    });
  }, [shouldLoadAnalytics, enabled]);

  return null;
}
