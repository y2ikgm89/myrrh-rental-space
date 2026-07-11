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
import { logger } from "@/shared/lib/errors/logger-core";
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

/**
 * Consent Mode v2: 全カテゴリ denied のペイロード。
 *
 * accept 後に user が同意を撤回した際、Google に対して "以後この user の追跡を
 * 止めよ" と伝える。既にロード済みの gtag.js が現ページビューで送ろうとしている
 * beacon は wait_for_update 期限内なら drop され、それ以降の遷移でも
 * unattributed 扱いになる。
 *
 * cached script 自体を DOM から除去することはできない (React が Script を
 * unmount しても browser は既に loaded)。完全クリアは `window.location.reload()`
 * だけが実現できる — 撤回後の reload と併用する。
 *
 * @see https://support.google.com/analytics/answer/9976101
 */
const CONSENT_DENIED_ALL = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
  functionality_storage: "denied",
} as const;

/**
 * 現在の window に gtag が存在すれば Consent Mode v2 の "update denied" を送る。
 * 存在しない (accept 前、GA 未設定) 場合は no-op。gtag 内部で throw した場合も
 * 撤回フロー自体を止めないよう swallow する。
 */
function notifyAnalyticsConsentDenied(): void {
  if (typeof globalThis.gtag !== "function") return;
  try {
    globalThis.gtag("consent", "update", CONSENT_DENIED_ALL);
  } catch {
    // gtag が壊れていても consent 撤回フローは継続する
  }
}

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
      // モバイルは下部固定ナビ(高さ4rem + ホームインジケータ inset)の上に積む。
      // デスクトップはナビが無い(md:hidden)ため inset 分だけ持ち上げる。
      className="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom,0px))] z-50 p-4 md:bottom-[env(safe-area-inset-bottom,0px)]"
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
                  rel="noreferrer"
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
              className="inline-flex min-h-11 items-center justify-center border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {rejectText || DEFAULT_REJECT_TEXT}
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="inline-flex min-h-11 items-center justify-center bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
 * Cookie同意をリセットするヘルパー関数（設定ページからの再選択用）。
 *
 * 撤回シナリオ (accept → 後日 reset) では以下の順序で完全クリアする:
 *
 * 1. `gtag('consent','update', denied all)` で Google 側の attribution を停止
 * 2. `localStorage.removeItem` で永続状態をクリア
 * 3. `cookie-consent-changed` イベントで React state を同期 (reload 前に
 *    banner が再表示される猶予を与える必要はないが、既存 subscriber との
 *    契約を維持)
 * 4. `window.location.reload()` でロード済み gtag.js / GTM script を完全に
 *    purge (script 自体は unmount しても browser cache に残り続けるため)
 *
 * accept していない状態から呼ばれた場合は gtag が存在しないので step 1 は
 * no-op、他のステップは同じ。
 */
export function resetCookieConsent(): void {
  if (typeof window === "undefined") return;
  try {
    notifyAnalyticsConsentDenied();
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent("cookie-consent-changed", { detail: null }),
    );
    window.location.reload();
  } catch (error) {
    logger.error("Failed to reset cookie consent", {
      error: getErrorMessage(error),
    });
  }
}
