/**
 * Analytics consent gate — banner OFF bypasses accept; banner ON requires accept.
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnalyticsType } from "@/shared/lib/validations/enums/prisma-types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

let mockShouldLoadAnalytics = true;

mock.module("@/public/components/analytics/use-analytics-consent", () => ({
  useAnalyticsConsent: () => mockShouldLoadAnalytics,
}));

mock.module("next/script", () => ({
  default: () => null,
}));

mock.module("@next/third-parties/google", () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => (
    <span data-testid="ga-script" data-ga-id={gaId} />
  ),
  GoogleTagManager: () => null,
}));

import { shouldLoadAnalytics } from "@/public/components/analytics/use-analytics-consent";
import { AnalyticsProvider } from "@/public/components/analytics/analytics-provider";

const analyticsConfig = {
  analyticsType: AnalyticsType.GA4,
  googleAnalyticsId: "G-TEST123",
  googleTagManagerId: null,
  googleSearchConsoleId: null,
  bingWebmasterToolsId: null,
  gaPropertyId: null,
  microsoftClarityId: null,
};

describe("shouldLoadAnalytics", () => {
  test("consent disabled: analytics may load without prior accept", () => {
    expect(shouldLoadAnalytics(false, null)).toBe(true);
    expect(shouldLoadAnalytics(false, "rejected")).toBe(true);
  });

  test("consent enabled + not accepted: analytics blocked", () => {
    expect(shouldLoadAnalytics(true, null)).toBe(false);
    expect(shouldLoadAnalytics(true, "rejected")).toBe(false);
  });

  test("consent enabled + accepted: analytics allowed", () => {
    expect(shouldLoadAnalytics(true, "accepted")).toBe(true);
  });
});

describe("AnalyticsProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockShouldLoadAnalytics = true;
  });

  test("renders GA script when consent gate passes", () => {
    act(() => {
      root.render(
        <AnalyticsProvider
          config={analyticsConfig}
          cookieConsentEnabled={false}
        />,
      );
    });

    expect(container.querySelector('[data-testid="ga-script"]')).not.toBeNull();
  });

  test("renders nothing when consent gate blocks", () => {
    mockShouldLoadAnalytics = false;

    act(() => {
      root.render(
        <AnalyticsProvider
          config={analyticsConfig}
          cookieConsentEnabled={true}
        />,
      );
    });

    expect(container.querySelector('[data-testid="ga-script"]')).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});
