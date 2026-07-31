"use client";

import { useEffect } from "react";
import { setNonce } from "get-nonce";

/**
 * `react-style-singleton` が注入する `<style>` に per-request nonce を渡す。
 *
 * Radix の scroll lock（`react-remove-scroll` → `react-remove-scroll-bar` →
 * `react-style-singleton`）は `document.createElement('style')` で stylesheet を作り、
 * `get-nonce` の `getNonce()` が値を返せばそこに `nonce` 属性を付ける:
 *
 * ```js
 * // node_modules/react-style-singleton/dist/es5/singleton.js
 * const nonce = getNonce();
 * if (nonce) tag.setAttribute('nonce', nonce);
 * ```
 *
 * 既定の `getNonce()` は webpack の `__webpack_nonce__` を見るが、本リポジトリは
 * Turbopack のため常に undefined。よって明示的に `setNonce()` する必要がある。
 * これが無いと `style-src 'self' 'nonce-…'` に弾かれ、**ダイアログを開いても背面の
 * スクロールが固定されず、スクロールバー分のガタつき補正も効かない**。
 *
 * 注入 CSS は実行時に測ったスクロールバー幅を含むので hash 化はできない（nonce 一択）。
 *
 * タイミング: stylesheet が作られるのは `RemoveScrollBar` が mount した瞬間＝
 * ユーザーがダイアログを開いた時なので、mount effect で十分間に合う。
 */
export function RegisterStyleNonce({
  nonce,
}: {
  readonly nonce: string;
}): null {
  useEffect(() => {
    setNonce(nonce);
  }, [nonce]);

  return null;
}
