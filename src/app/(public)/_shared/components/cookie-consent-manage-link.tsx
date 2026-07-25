"use client";

import {
  resetCookieConsent,
  useCookieConsent,
} from "@/public/components/cookie-consent-banner";

interface CookieConsentManageLinkProps {
  readonly cookieConsentEnabled: boolean;
}

/**
 * Footer / privacy-adjacent control to withdraw or change a prior cookie choice.
 * Visible only when the banner is enabled and the visitor has already decided.
 */
export function CookieConsentManageLink({
  cookieConsentEnabled,
}: CookieConsentManageLinkProps) {
  const consentStatus = useCookieConsent();

  if (!cookieConsentEnabled || consentStatus === null) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => resetCookieConsent()}
      className="transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
    >
      Cookie設定
    </button>
  );
}
