"use client";

/**
 * Cookie同意バナーコンポーネント
 *
 * GDPR対応のCookie同意バナー
 * - 同意/拒否の選択をlocalStorageに保存
 * - 同意時のみAnalyticsを有効化
 * - useSyncExternalStoreでlocalStorageと同期（React 18推奨パターン）
 */

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isAppRoute } from "@/shared/lib/typed-routes";

// デフォルト値
const DEFAULT_MESSAGE =
  "当サイトでは、サービス向上のためにCookieを使用しています。Cookieの使用に同意いただける場合は「同意する」をクリックしてください。";
const DEFAULT_ACCEPT_TEXT = "同意する";
const DEFAULT_REJECT_TEXT = "拒否する";
const DEFAULT_POLICY_URL = "/terms/privacy-policy";

const STORAGE_KEY = "cookie-consent";

export type CookieConsentStatus = "accepted" | "rejected" | null;

// 型ガード: localStorageの値がCookieConsentStatusかどうか
function isValidConsentStatus(
  value: string | null,
): value is "accepted" | "rejected" {
  return value === "accepted" || value === "rejected";
}

// localStorageからCookie同意状態を取得
function getSnapshot(): CookieConsentStatus {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isValidConsentStatus(value) ? value : null;
  } catch {
    // プライベートブラウジングモードなどでlocalStorageが使用不可の場合
    return null;
  }
}

// SSR用のスナップショット（常にnull）
function getServerSnapshot(): CookieConsentStatus {
  return null;
}

// storageイベントを購読
function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("cookie-consent-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("cookie-consent-changed", callback);
  };
}

/**
 * Cookie同意状態を取得するhook
 * useSyncExternalStoreでlocalStorageと同期
 */
export function useCookieConsent(): CookieConsentStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface CookieConsentBannerProps {
  message?: string | null;
  acceptText?: string | null;
  rejectText?: string | null;
  policyUrl?: string | null;
}

export function CookieConsentBanner({
  message,
  acceptText,
  rejectText,
  policyUrl,
}: CookieConsentBannerProps) {
  // useSyncExternalStoreでlocalStorageと同期
  const consentStatus = useCookieConsent();

  const handleAccept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
      // カスタムイベントを発火してuseSyncExternalStoreに通知
      window.dispatchEvent(
        new CustomEvent("cookie-consent-changed", { detail: "accepted" }),
      );
    } catch (error) {
      logger.error("Failed to save cookie consent", {
        error: getErrorMessage(error),
      });
    }
  };

  const handleReject = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "rejected");
      // カスタムイベントを発火してuseSyncExternalStoreに通知
      window.dispatchEvent(
        new CustomEvent("cookie-consent-changed", { detail: "rejected" }),
      );
    } catch (error) {
      logger.error("Failed to save cookie consent", {
        error: getErrorMessage(error),
      });
    }
  };

  // 同意済みの場合は何も表示しない
  if (consentStatus) {
    return null;
  }

  const effectivePolicyUrl = policyUrl || DEFAULT_POLICY_URL;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-0 bottom-0 z-50 p-4"
    >
      <div className="mx-auto max-w-4xl border bg-background p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-2">
            <h2 id="cookie-consent-title" className="sr-only">
              Cookie使用の同意
            </h2>
            <p
              id="cookie-consent-description"
              className="text-sm text-muted-foreground"
            >
              {message || DEFAULT_MESSAGE}{" "}
              {isAppRoute(effectivePolicyUrl) ? (
                <Link
                  href={effectivePolicyUrl}
                  className="text-accent underline underline-offset-4 hover:text-foreground"
                >
                  詳細
                </Link>
              ) : (
                <a
                  href={effectivePolicyUrl}
                  className="text-accent underline underline-offset-4 hover:text-foreground"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  詳細
                </a>
              )}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <button
              type="button"
              onClick={handleReject}
              className="inline-flex items-center justify-center border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {rejectText || DEFAULT_REJECT_TEXT}
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="inline-flex items-center justify-center bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {acceptText || DEFAULT_ACCEPT_TEXT}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Cookie同意状態を取得するヘルパー関数
 * クライアントサイドでのみ使用可能
 */
export function getCookieConsentStatus(): CookieConsentStatus {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isValidConsentStatus(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Cookie同意をリセットするヘルパー関数
 * 設定ページからの再選択用
 */
export function resetCookieConsent(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent("cookie-consent-changed", { detail: null }),
    );
  } catch (error) {
    logger.error("Failed to reset cookie consent", {
      error: getErrorMessage(error),
    });
  }
}
