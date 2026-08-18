/**
 * Lexical 印刷プレビュー用の blob HTML。
 *
 * `window.open(blob:)` は initiator の CSP を継承する（WPT
 * content-security-policy/inheritance/blob-url-inherits-from-initiator）。
 * 本番の `style-src` は nonce 必須なので、`<style>` に document の nonce を付ける。
 * nonce が無いときは属性を省略する（ブロックされるだけで機能は壊れない）。
 */
export function buildPrintPreviewHtml(
  bodyHtml: string,
  nonce: string | null | undefined,
): string {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return (
    `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>印刷プレビュー</title>` +
    `<style${nonceAttr}>body{font-family:sans-serif;max-width:21cm;margin:2cm auto;padding:0 2.5cm}` +
    `@media print{body{margin:0}}</style></head><body>${bodyHtml}</body></html>`
  );
}
