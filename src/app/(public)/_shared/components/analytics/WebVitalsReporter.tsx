"use client";

/**
 * Web Vitals Reporter
 *
 * Core Web Vitals（CLS, INP, LCP）+ 補助指標（FCP, TTFB）を計測。
 * GA4 が有効な場合は gtag() に送信。無効な場合は開発コンソールに出力。
 *
 * GDPR対応: Cookie同意後のみ計測開始（AnalyticsProvider と同じ条件）
 *
 * @see https://web.dev/articles/vitals
 */

import { useEffect } from "react";
import { useCookieConsent } from "@/public/components/cookie-consent-banner";
import { logger } from "@/shared/lib/logger";

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
}

export function WebVitalsReporter({ enabled }: WebVitalsReporterProps) {
  const consentStatus = useCookieConsent();

  useEffect(() => {
    // Cookie同意がない場合、またはAnalyticsが無効な場合はスキップ
    // ただし開発環境ではコンソール出力のため常に有効
    if (
      consentStatus !== "accepted" &&
      process.env["NODE_ENV"] !== "development"
    ) {
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
  }, [consentStatus, enabled]);

  return null;
}
