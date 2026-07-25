"use client";

import {
  useCookieConsent,
  type CookieConsentStatus,
} from "@/public/components/cookie-consent-banner";

/**
 * Whether analytics scripts / Web Vitals may run for the current visitor.
 *
 * - Banner OFF (`cookieConsentEnabled === false`): always true (no consent gate).
 * - Banner ON: true only after explicit accept.
 */
export function shouldLoadAnalytics(
  cookieConsentEnabled: boolean,
  consentStatus: CookieConsentStatus,
): boolean {
  if (!cookieConsentEnabled) {
    return true;
  }
  return consentStatus === "accepted";
}

export function useAnalyticsConsent(cookieConsentEnabled: boolean): boolean {
  const consentStatus = useCookieConsent();
  return shouldLoadAnalytics(cookieConsentEnabled, consentStatus);
}
