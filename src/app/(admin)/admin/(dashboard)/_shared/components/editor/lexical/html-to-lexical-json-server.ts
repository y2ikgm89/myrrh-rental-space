import "server-only";

import { tryConvertHtmlStringToLexicalJsonCore } from "./html-to-lexical-json-core";

export type { ConvertHtmlToLexicalJsonResult } from "./html-to-lexical-json-core";

/**
 * Server / RSC 向け HTML → Lexical JSON import。
 * DOM bootstrap は core 内 `withDOM` が担当。
 */
export function tryConvertHtmlStringToLexicalJsonServer(
  html: string,
): ReturnType<typeof tryConvertHtmlStringToLexicalJsonCore> {
  return tryConvertHtmlStringToLexicalJsonCore(html);
}
