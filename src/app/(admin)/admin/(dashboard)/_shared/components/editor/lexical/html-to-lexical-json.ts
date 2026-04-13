/**
 * HTML 文字列を Lexical EditorState JSON 文字列へ変換する（クライアント専用）
 *
 * @description DOMParser / $generateNodesFromDOM を使うためブラウザ環境でのみ呼び出すこと。
 * 変換失敗時は空 JSON にフォールバックせず、呼び出し側が `ok: false` を処理する。
 */

"use client";

import { $generateNodesFromDOM } from "@lexical/html";
import { createEditor, $getRoot, $insertNodes } from "lexical";

import { EDITOR_NODES } from "./config/nodes";
import { editorTheme } from "./theme";
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
 * 規約テンプレート等の HTML を、本番エディタと同一ノード登録で Lexical JSON に変換する。
 *
 * - 入力が空（trim 後）のときは **意図した空ドキュメント** として `EMPTY_LEXICAL_EDITOR_STATE_JSON` を返す（失敗ではない）。
 * - パース・挿入・スキーマ検証のいずれかで不整合なら `ok: false`。
 */
export function tryConvertHtmlStringToLexicalJsonString(
  html: string,
): ConvertHtmlToLexicalJsonResult {
  const trimmed = html.trim();
  if (trimmed === "") {
    return { ok: true, json: EMPTY_LEXICAL_EDITOR_STATE_JSON };
  }

  const editor = createEditor({
    namespace: "LexicalEditor",
    theme: editorTheme,
    nodes: [...EDITOR_NODES],
    onError: (error: Error) => {
      logger.error("tryConvertHtmlStringToLexicalJsonString editor error", {
        error: error.message,
      });
    },
  });

  try {
    editor.update(
      () => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(trimmed, "text/html");
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();
        root.clear();
        // 空ルート先頭への挿入位置を明示（ElementNode.selectStart）
        root.selectStart();
        $insertNodes(nodes);
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    if (!isLexicalComposerReadyEditorStateJson(json)) {
      logger.error(
        "tryConvertHtmlStringToLexicalJsonString: output failed schema check",
      );
      return {
        ok: false,
        error:
          "HTML の変換結果が有効な Lexical EditorState になりませんでした。テンプレート HTML を確認してください。",
      };
    }
    return { ok: true, json };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error("tryConvertHtmlStringToLexicalJsonString failed", {
      error: message,
    });
    return {
      ok: false,
      error: `HTML を Lexical JSON に変換できませんでした: ${message}`,
    };
  }
}
