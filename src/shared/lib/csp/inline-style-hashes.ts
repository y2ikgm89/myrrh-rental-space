/**
 * `style-src` に載せる hash-source の SSoT。
 *
 * `<style>` 要素は nonce で守るのが原則（`NonceStyleBlock` / `RegisterStyleNonce`）だが、
 * **nonce を受け取る API を持たないライブラリ**が 1 つだけある: `sonner`。
 *
 * ```js
 * // node_modules/sonner/dist/index.mjs
 * function __insertCSS(code) {
 *   let style = document.createElement('style')
 *   head.appendChild(style)                                   // ← 空のまま先に挿入
 *   style.appendChild(document.createTextNode(code))          // ← 後から中身を入れる
 * }
 * ```
 *
 * module 評価時の副作用として無条件に実行され、nonce を付与する手段が無い
 * （`sonner` の dist に "nonce" は 1 件も出てこない）。さらに **空 `<style>` を先に挿入して
 * から中身を足す**ため、CSP は「空文字列」と「CSS 本体」の 2 回評価する。よって hash も 2 つ要る。
 *
 * これらは**厳密な内容一致 hash**なので、任意の inline style を許すわけではない
 * （`'unsafe-inline'` とは危険度が桁違い）。sonner を上げると CSS 本体が変わって hash が
 * ずれるが、`__tests__/unit/architecture/csp-inline-style-hashes.test.ts` が
 * インストール済み `sonner` から再計算して drift を落とすため、本番に出る前に気付ける。
 *
 * 一方 `react-remove-scroll-bar`（Radix の scroll lock）の `<style>` は
 * **実行時に測ったスクロールバー幅を含む**ので hash 化できない。こちらは
 * `react-style-singleton` が `get-nonce` の `getNonce()` を読むので、
 * `RegisterStyleNonce` が `setNonce()` を呼んで nonce 経路で通す。
 */

/** SHA-256(base64) of the empty string — sonner が中身を入れる前に挿入する空 `<style>`。 */
export const EMPTY_STYLE_HASH =
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='";

/** SHA-256(base64) of the CSS `sonner` injects at module evaluation time. */
export const SONNER_STYLE_HASH =
  "'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='";

/** `style-src` に追加する hash-source（順序は CSP header の出力順）。 */
export const STYLE_ELEMENT_HASHES = [
  EMPTY_STYLE_HASH,
  SONNER_STYLE_HASH,
] as const;
