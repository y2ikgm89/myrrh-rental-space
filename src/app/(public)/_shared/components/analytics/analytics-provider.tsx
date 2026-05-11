"use client";

/**
 * Analytics Provider Component
 *
 * GDPR対応: Cookie同意後のみAnalyticsスクリプトを読み込む
 * Client Componentとして動作し、useCookieConsentで同意状態を監視
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/third-party-libraries
 */

import Script from "next/script";
import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";
import { useCookieConsent } from "@/public/components/cookie-consent-banner";
import type { AnalyticsConfig } from "@/shared/lib/analytics/config";
import { AnalyticsType } from "@/shared/lib/validations/enums/prisma-types";

interface AnalyticsProviderProps {
  config: AnalyticsConfig;
  nonce?: string | null;
}

/**
 * Microsoft Clarity 公式 inline loader（GA4/GTM と並行動作）
 * @see https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup
 */
function ClarityScript({
  projectId,
  nonce,
}: {
  projectId: string;
  nonce?: string | null;
}) {
  const inline = `
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${projectId}");
`.trim();

  const scriptProps: {
    id: string;
    strategy: "afterInteractive";
    nonce?: string;
  } = {
    id: "ms-clarity",
    strategy: "afterInteractive",
  };
  if (nonce != null) scriptProps.nonce = nonce;

  return (
    <Script
      {...scriptProps}
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Microsoft Clarity 公式 inline loader（静的文字列 + ID は Zod max(50) 検証済）
      dangerouslySetInnerHTML={{ __html: inline }}
    />
  );
}

function GaScript({ gaId, nonce }: { gaId: string; nonce?: string | null }) {
  const props: { gaId: string; nonce?: string } = { gaId };
  if (nonce != null) props.nonce = nonce;
  return <GoogleAnalytics {...props} />;
}

function GtmScript({ gtmId, nonce }: { gtmId: string; nonce?: string | null }) {
  const props: { gtmId: string; nonce?: string } = { gtmId };
  if (nonce != null) props.nonce = nonce;
  return <GoogleTagManager {...props} />;
}

/**
 * Analytics Provider
 *
 * - Cookie同意が 'accepted' の場合のみスクリプトを出力
 * - analyticsType が 'ga4' の場合: GoogleAnalytics を出力
 * - analyticsType が 'gtm' の場合: GoogleTagManager を出力
 * - microsoftClarityId が設定されている場合: Clarity を並行出力（GA4/GTM とは独立）
 */
export function AnalyticsProvider({ config, nonce }: AnalyticsProviderProps) {
  const consentStatus = useCookieConsent();

  // Cookie同意がない場合は何も出力しない（GDPR準拠）
  if (consentStatus !== "accepted") {
    return null;
  }

  const isGa4 =
    config.analyticsType === AnalyticsType.ga4 && config.googleAnalyticsId;
  const isGtm =
    config.analyticsType === AnalyticsType.gtm && config.googleTagManagerId;
  const hasClarity = Boolean(config.microsoftClarityId);

  if (!isGa4 && !isGtm && !hasClarity) {
    return null;
  }

  const nonceProp = nonce != null ? { nonce } : {};

  return (
    <>
      {isGa4 && config.googleAnalyticsId && (
        <GaScript gaId={config.googleAnalyticsId} {...nonceProp} />
      )}
      {isGtm && config.googleTagManagerId && (
        <GtmScript gtmId={config.googleTagManagerId} {...nonceProp} />
      )}
      {config.microsoftClarityId && (
        <ClarityScript projectId={config.microsoftClarityId} {...nonceProp} />
      )}
    </>
  );
}
