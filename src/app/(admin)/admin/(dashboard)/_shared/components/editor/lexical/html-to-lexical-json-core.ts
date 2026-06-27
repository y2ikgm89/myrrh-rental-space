import { $generateNodesFromDOM } from "@lexical/html";
import { withDOM } from "@lexical/headless/dom";
import { $getRoot, $insertNodes } from "lexical";
import { createProjectHeadlessEditor } from "./create-headless-lexical-editor";
import {
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  isLexicalComposerReadyEditorStateJson,
} from "@/shared/lib/validations/lexical";
import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

export type ConvertHtmlToLexicalJsonResult =
  | { ok: true; json: string }
  | { ok: false; error: string };

/**
 * HTML 文字列 → Lexical EditorState JSON（環境非依存コア）。
 *
 * 公式: `createHeadlessEditor` + `withDOM` + `$generateNodesFromDOM`。
 */
export function tryConvertHtmlStringToLexicalJsonCore(
  html: string,
): ConvertHtmlToLexicalJsonResult {
  const trimmed = html.trim();
  if (trimmed === "") {
    return { ok: true, json: EMPTY_LEXICAL_EDITOR_STATE_JSON };
  }

  try {
    return withDOM(() => {
      const editor = createProjectHeadlessEditor();

      editor.update(
        () => {
          const parser = new DOMParser();
          const dom = parser.parseFromString(trimmed, "text/html");
          const nodes = $generateNodesFromDOM(editor, dom);
          const root = $getRoot();
          root.clear();
          root.selectStart();
          $insertNodes(nodes);
        },
        { discrete: true },
      );

      const json = JSON.stringify(editor.getEditorState().toJSON());
      if (!isLexicalComposerReadyEditorStateJson(json)) {
        logger.error(
          "tryConvertHtmlStringToLexicalJsonCore: output failed schema check",
        );
        return {
          ok: false,
          error:
            "HTML の変換結果が有効な Lexical EditorState になりませんでした。テンプレート HTML を確認してください。",
        };
      }
      return { ok: true, json };
    });
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error("tryConvertHtmlStringToLexicalJsonCore failed", {
      error: message,
    });
    return {
      ok: false,
      error: `HTML を Lexical JSON に変換できませんでした: ${message}`,
    };
  }
}
