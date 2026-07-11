/**
 * `resetCookieConsent` の Consent Mode v2 契約テスト。
 *
 * 撤回シナリオで下記全ステップが正しく実行されるかを検証する:
 *
 * 1. gtag が存在すれば `gtag('consent','update', denied all)` を送る
 *    (Google 側の attribution を停止する)
 * 2. gtag が存在しなくても他のステップが継続する
 * 3. localStorage の STORAGE_KEY がクリアされる
 * 4. `cookie-consent-changed` イベントが detail: null で dispatch される
 * 5. `window.location.reload()` が呼ばれる
 *    (ロード済み gtag.js を完全 purge する唯一の手段)
 */

import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";

import { installJSDOMForTests } from "../../setup-dom";
import { resetCookieConsent } from "@/public/components/cookie-consent-banner";

const STORAGE_KEY = "cookie-consent";

/**
 * JSDOM の `window.location` は non-configurable なので通常の
 * `Object.defineProperty(window, "location", ...)` は
 * "cannot change configurable attribute" で throw する。
 * bun test の `spyOn` は非公開の hook を使って getter/setter を差し替え
 * この制約を回避できる — Location proto でなく instance に spy を仕込む。
 */
function installReloadSpy(): ReturnType<typeof spyOn> {
  return spyOn(window.location, "reload").mockImplementation(() => {});
}

function installGtagSpy(): ReturnType<typeof mock> {
  const spy = mock(() => {});
  Object.defineProperty(globalThis, "gtag", {
    value: spy,
    writable: true,
    configurable: true,
  });
  return spy;
}

function removeGtag(): void {
  Object.defineProperty(globalThis, "gtag", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

describe("resetCookieConsent", () => {
  beforeEach(() => {
    installJSDOMForTests();
    localStorage.clear();
    removeGtag();
  });

  test("removes the cookie-consent storage entry", () => {
    using _reload = installReloadSpy();
    localStorage.setItem(STORAGE_KEY, "accepted");

    resetCookieConsent();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("dispatches cookie-consent-changed with detail null", () => {
    using _reload = installReloadSpy();
    let detail: unknown = "not-called";
    const handler = (event: Event) => {
      // CustomEvent は Event を継承。CustomEvent の detail のみ取り出す。
      if ("detail" in event) {
        detail = (event as CustomEvent<unknown>).detail;
      }
    };
    window.addEventListener("cookie-consent-changed", handler);

    resetCookieConsent();

    window.removeEventListener("cookie-consent-changed", handler);
    expect(detail).toBeNull();
  });

  test("sends Consent Mode v2 update denied when gtag exists", () => {
    using _reload = installReloadSpy();
    const gtagSpy = installGtagSpy();

    resetCookieConsent();

    expect(gtagSpy).toHaveBeenCalledTimes(1);
    expect(gtagSpy).toHaveBeenCalledWith(
      "consent",
      "update",
      expect.objectContaining({
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
        functionality_storage: "denied",
      }),
    );
  });

  test("does not throw and completes reset when gtag is undefined", () => {
    using _reload = installReloadSpy();
    // gtag は beforeEach で removeGtag 済み。追加設定なしで呼べることを確認。
    localStorage.setItem(STORAGE_KEY, "accepted");

    expect(() => resetCookieConsent()).not.toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("does not propagate gtag internal errors", () => {
    using _reload = installReloadSpy();
    Object.defineProperty(globalThis, "gtag", {
      value: () => {
        throw new Error("gtag broken");
      },
      writable: true,
      configurable: true,
    });
    localStorage.setItem(STORAGE_KEY, "accepted");

    expect(() => resetCookieConsent()).not.toThrow();
    // gtag が throw しても localStorage クリアと reload は続行する
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("triggers window.location.reload as the final purge step", () => {
    using reloadSpy = installReloadSpy();

    resetCookieConsent();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("still reloads even when there was no prior consent (idempotent)", () => {
    using reloadSpy = installReloadSpy();
    // STORAGE_KEY 未設定でも安全に走ることを確認
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    resetCookieConsent();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
