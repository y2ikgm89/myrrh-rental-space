import "server-only";

import { ensureLexicalDomEnvironment } from "./lexical-dom-environment.server";
import { tryConvertHtmlStringToLexicalJsonCore } from "./html-to-lexical-json-core";

export type { ConvertHtmlToLexicalJsonResult } from "./html-to-lexical-json-core";

/**
 * Server / RSC 向け HTML → Lexical JSON import。
 */
export function tryConvertHtmlStringToLexicalJsonServer(
  html: string,
): ReturnType<typeof tryConvertHtmlStringToLexicalJsonCore> {
  ensureLexicalDomEnvironment();
  return tryConvertHtmlStringToLexicalJsonCore(html);
}
