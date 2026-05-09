/**
 * Structure insert items — 基本ブロック・リスト・テキスト変換・ウィジェット・その他・テンプレート
 *
 * 純粋な文書構造（段落・見出し・引用・コード・リスト）と
 * 単発のユーティリティ（ボタン・区切り線・目次・ページ区切り・テキスト変換・テンプレート操作）。
 */

import { $createCodeNode } from "@lexical/code";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import {
  IconBlockquote,
  IconBoxMultiple,
  IconCode,
  IconDeviceFloppy,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconLetterCase,
  IconLetterCaseLower,
  IconLetterCaseUpper,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconMinus,
  IconPilcrow,
  IconPointer,
  IconScissors,
  IconShape,
} from "@tabler/icons-react";
import { INSERT_PAGE_BREAK_COMMAND } from "../../plugins/PageBreakPlugin";
import { applyTextCaseToSelection } from "../../plugins/TextCasePlugin";
import { applySetBlocksType, createParagraphBlock } from "./types";
import type { InsertItem } from "./types";

export const STRUCTURE_INSERT_ITEMS: readonly InsertItem[] = [
  // ========== 基本ブロック ==========
  {
    id: "paragraph",
    type: "transform",
    label: "本文",
    icon: IconPilcrow,
    keywords: ["paragraph", "normal", "honbun", "text"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => createParagraphBlock(),
  },
  {
    id: "h1",
    type: "transform",
    label: "見出し1",
    icon: IconH1,
    keywords: ["heading", "h1", "midashi", "title"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => applySetBlocksType(() => $createHeadingNode("h1")),
  },
  {
    id: "h2",
    type: "transform",
    label: "見出し2",
    icon: IconH2,
    keywords: ["heading", "h2", "midashi"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => applySetBlocksType(() => $createHeadingNode("h2")),
  },
  {
    id: "h3",
    type: "transform",
    label: "見出し3",
    icon: IconH3,
    keywords: ["heading", "h3", "midashi"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => applySetBlocksType(() => $createHeadingNode("h3")),
  },
  {
    id: "h4",
    type: "transform",
    label: "見出し4",
    icon: IconH4,
    keywords: ["heading", "h4", "midashi"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => applySetBlocksType(() => $createHeadingNode("h4")),
  },
  {
    id: "quote",
    type: "transform",
    label: "引用",
    icon: IconBlockquote,
    keywords: ["quote", "blockquote", "inyou"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => applySetBlocksType(() => $createQuoteNode()),
  },
  {
    id: "code",
    type: "transform",
    label: "コードブロック",
    icon: IconCode,
    keywords: ["code", "codeblock", "programming", "koudo"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => applySetBlocksType(() => $createCodeNode()),
  },

  // ========== リスト ==========
  {
    id: "ul",
    type: "command",
    label: "箇条書き",
    icon: IconList,
    keywords: ["bullet", "list", "ul", "kajogaki"],
    category: "list",
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
  },
  {
    id: "ol",
    type: "command",
    label: "番号付きリスト",
    icon: IconListNumbers,
    keywords: ["numbered", "list", "ol", "bangou"],
    category: "list",
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
  },
  {
    id: "checklist",
    type: "command",
    label: "チェックリスト",
    icon: IconListCheck,
    keywords: ["check", "todo", "list", "chekkurisuto", "task"],
    category: "list",
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
  },

  // ========== テキスト変換 ==========
  {
    id: "lowercase",
    type: "command",
    label: "小文字",
    icon: IconLetterCaseLower,
    keywords: ["lowercase", "komoji", "small", "lower"],
    category: "format",
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => applyTextCaseToSelection(editor, "lowercase"),
  },
  {
    id: "uppercase",
    type: "command",
    label: "大文字",
    icon: IconLetterCaseUpper,
    keywords: ["uppercase", "oomoji", "capital", "upper"],
    category: "format",
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => applyTextCaseToSelection(editor, "uppercase"),
  },
  {
    id: "capitalize",
    type: "command",
    label: "先頭大文字",
    icon: IconLetterCase,
    keywords: ["capitalize", "sentou", "title", "titlecase"],
    category: "format",
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => applyTextCaseToSelection(editor, "capitalize"),
  },

  // ========== ウィジェット ==========
  {
    id: "button",
    type: "dialog",
    label: "ボタン",
    icon: IconPointer,
    keywords: ["button", "cta", "botan", "link", "action"],
    category: "widget",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "button",
  },
  {
    id: "inline-icon",
    type: "dialog",
    label: "アイコン",
    icon: IconShape,
    keywords: ["icon", "アイコン", "symbol", "tabler", "inline"],
    category: "widget",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "inline-icon",
  },

  // ========== その他 ==========
  {
    id: "hr",
    type: "command",
    label: "区切り線",
    icon: IconMinus,
    keywords: ["divider", "hr", "horizontal", "kugirisenn", "line"],
    category: "other",
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
  },
  {
    id: "pageBreak",
    type: "command",
    label: "ページ区切り",
    icon: IconScissors,
    keywords: ["pagebreak", "print", "kukiri", "page", "insatsu"],
    category: "other",
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_PAGE_BREAK_COMMAND, undefined),
  },

  // ========== テンプレート ==========
  {
    id: "blockTemplateInsert",
    type: "dialog",
    label: "テンプレート挿入",
    icon: IconBoxMultiple,
    keywords: [
      "template",
      "block",
      "tenpure-to",
      "テンプレート",
      "ブロック",
      "saiyou",
    ],
    category: "template",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "blockTemplateInsert",
  },
  {
    id: "blockTemplateSave",
    type: "dialog",
    label: "テンプレート保存",
    icon: IconDeviceFloppy,
    keywords: ["template", "save", "hozon", "テンプレート", "保存"],
    category: "template",
    showInToolbar: true,
    showInPicker: false,
    dialogId: "blockTemplateSave",
  },
];
