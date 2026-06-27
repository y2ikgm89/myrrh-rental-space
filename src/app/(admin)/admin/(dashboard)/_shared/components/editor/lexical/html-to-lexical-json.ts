/**
 * HTML 文字列を Lexical EditorState JSON 文字列へ変換する（クライアント専用）
 *
 * @description ブラウザ DOM 上で core import を実行する thin wrapper。
 */

"use client";

export {
  tryConvertHtmlStringToLexicalJsonCore as tryConvertHtmlStringToLexicalJsonString,
  type ConvertHtmlToLexicalJsonResult,
} from "./html-to-lexical-json-core";
