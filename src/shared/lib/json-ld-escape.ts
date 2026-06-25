/**
 * JSON-LD escape SSoT
 *
 * `<script type="application/ld+json">` に埋め込む JSON 文字列を安全化する。
 * HTML 解析の文脈で危険な記号 (`<`, `>`, `&`) と、JavaScript パーサが行終端と
 * 解釈する Unicode 行区切り (U+2028 / U+2029) を Unicode エスケープにする。
 *
 * U+2028 (LINE SEPARATOR) と U+2029 (PARAGRAPH SEPARATOR) はそのままだと
 * inline `<script>` 文脈で改行扱いとなり JS 文字列リテラル外への break-out を
 * 許す。JSON 内に表れた場合に限り、これら 5 種類を機械的に置換しておけば
 * 構造化データとして valid なまま、XSS の余地を残さず安全に出力できる。
 *
 * @see https://redux.js.org/usage/server-rendering#security-considerations
 * @see https://developers.google.com/search/docs/appearance/structured-data
 */

/**
 * `JSON.stringify(data)` の結果を、`<script type="application/ld+json">` の
 * `innerHTML` に直接埋め込めるよう 5 種類の文字を Unicode エスケープする。
 *
 * - `<` → `<` : `</script>` の早期クローズ防止
 * - `>` → `>` : 念のため対称に処理
 * - `&` → `&` : HTML エンティティ解釈の抑止
 * - U+2028 → ` ` : JS 行区切りによる文字列リテラル break-out 防止
 * - U+2029 → ` ` : JS 段落区切りによる文字列リテラル break-out 防止
 */
export function escapeJsonForScriptTag(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
