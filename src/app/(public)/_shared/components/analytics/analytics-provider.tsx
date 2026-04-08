"use client";

/**
 * Analytics Provider Component
 *
 * GDPR対応: Cookie同意後のみAnalyticsスクリプトを読み込む
 * Client Componentとして動作し、useCookieConsentで同意状態を監視
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/third-party-libraries
 */

import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";
import { useCookieConsent } from "@/public/components/cookie-consent-banner";
import type { AnalyticsConfig } from "@/shared/lib/analytics/config";
import { AnalyticsType } from "@generated/prisma/enums";

interface AnalyticsProviderProps {
  config: AnalyticsConfig;
  nonce?: string | null;
}

/**
 * Analytics Provider
 *
 * - Cookie同意が 'accepted' の場合のみスクリプトを出力
 * - analyticsType が 'ga4' の場合: GoogleAnalytics を出力
 * - analyticsType が 'gtm' の場合: GoogleTagManager を出力
 * - それ以外の場合: 何も出力しない
 */
export function AnalyticsProvider({ config, nonce }: AnalyticsProviderProps) {
  const consentStatus = useCookieConsent();

  // Cookie同意がない場合は何も出力しない（GDPR準拠）
  if (consentStatus !== "accepted") {
    return null;
  }

  // 無効の場合は何も出力しない
  if (!config.analyticsType) {
    return null;
  }

  // GA4の場合
  if (config.analyticsType === AnalyticsType.ga4 && config.googleAnalyticsId) {
    const gaProps: { gaId: string; nonce?: string } = {
      gaId: config.googleAnalyticsId,
    };
    if (nonce != null) gaProps.nonce = nonce;
    return <GoogleAnalytics {...gaProps} />;
  }

  // GTMの場合
  if (config.analyticsType === AnalyticsType.gtm && config.googleTagManagerId) {
    const gtmProps: { gtmId: string; nonce?: string } = {
      gtmId: config.googleTagManagerId,
    };
    if (nonce != null) gtmProps.nonce = nonce;
    return <GoogleTagManager {...gtmProps} />;
  }

  return null;
}
