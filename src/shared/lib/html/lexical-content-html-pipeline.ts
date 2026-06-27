import { enrichLexicalContentHtmlWithCuratedIcons } from "@/shared/lib/html/enrich-lexical-content-html-icons";
import { sanitizeLexicalContentHtml } from "@/shared/lib/html/sanitize-content-html-core";

/**
 * Lexical `$generateHtmlFromNodes` 出力を公開/保存向け HTML に仕上げる。
 */
export function finalizeLexicalExportedHtml(html: string): string {
  return sanitizeLexicalContentHtml(
    enrichLexicalContentHtmlWithCuratedIcons(html),
  );
}
