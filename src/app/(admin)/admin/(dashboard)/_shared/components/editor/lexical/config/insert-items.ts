/**
 * Insert Items Configuration
 *
 * @description ToolbarPlugin / ComponentPickerPlugin 共通のインサートアイテム定義
 *
 * 新しいインサートアイテムを追加する場合：
 * 1. INSERT_ITEMS 配列にエントリーを追加
 * 2. type: 'dialog' の場合は dialog-registry.ts にもエントリーを追加
 *
 * 挿入の実行は Lexical の推奨どおり **単一の `editor.update` 内**にまとめる。
 * スラッシュメニューは `applyInsertItemInUpdate`、ツールバーは `executeInsertItem` を使う。
 */

import type { ComponentType } from "react";
import type { LexicalEditor, ElementNode } from "lexical";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createCodeNode } from "@lexical/code";
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  TextQuote,
  List,
  ListOrdered,
  ListChecks,
  Image as ImageIcon,
  Video,
  Table,
  Minus,
  Code,
  Columns,
  CaseLower,
  CaseUpper,
  CaseSensitive,
  Scissors,
  CircleAlert,
  ChevronsDownUp,
  MousePointerClick,
  Quote,
  Link2,
  Footprints,
  PanelTop,
  ListTree,
  Blocks,
  Save,
  Map,
  Volume2,
  Paperclip,
  Music,
  LayoutGrid,
  Clock,
  Table2,
  MessageSquareQuote,
  Rows3,
} from "lucide-react";
import {
  SiX,
  SiInstagram,
  SiYoutube,
  SiFigma,
} from "@icons-pack/react-simple-icons";
import { applyTextCaseToSelection } from "../plugins/TextCasePlugin";
import { INSERT_PAGE_BREAK_COMMAND } from "../plugins/PageBreakPlugin";
import { INSERT_COLLAPSIBLE_COMMAND } from "../plugins/CollapsiblePlugin";
import { INSERT_TOC_COMMAND } from "../plugins/TableOfContentsPlugin";
import type { DialogId } from "../dialogs/dialog-types";

// =============================================================================
// Types
// =============================================================================

export type InsertCategory =
  | "basic"
  | "list"
  | "media"
  | "layout"
  /** 料金表・タイムライン等の複合コンテンツブロック（レイアウト骨格とは分離） */
  | "patterns"
  | "format"
  | "widget"
  | "other"
  | "template";

export type IconComponent = ComponentType<{
  size?: number | string;
  color?: string;
  className?: string;
}>;

type InsertItemBase = {
  id: string;
  label: string;
  icon: IconComponent;
  keywords: readonly string[];
  category: InsertCategory;
  /** Toolbar Insert メニューに表示するか */
  showInToolbar: boolean;
  /** ComponentPicker "/" に表示するか */
  showInPicker: boolean;
};

type DialogInsertItem = InsertItemBase & {
  type: "dialog";
  dialogId: DialogId;
};

type CommandInsertItem = InsertItemBase & {
  type: "command";
  dispatch: (editor: LexicalEditor) => void;
};

type TransformInsertItem = InsertItemBase & {
  type: "transform";
  /**
   * 呼び出し側の `editor.update` コールバック内でのみ実行すること。
   * `$getSelection` / `$setBlocksType` 等の Lexical $ API のみ使用し、
   * ネストした `editor.update` を起動しない。
   */
  applyInUpdate: () => void;
};

export type InsertItem =
  | DialogInsertItem
  | CommandInsertItem
  | TransformInsertItem;

// =============================================================================
// Category Labels
// =============================================================================

export const CATEGORY_LABELS: Record<InsertCategory, string> = {
  basic: "基本ブロック",
  list: "リスト",
  media: "メディア",
  layout: "レイアウト",
  patterns: "コンテンツパターン",
  format: "テキスト変換",
  widget: "ウィジェット",
  other: "その他",
  template: "テンプレート",
};

export const CATEGORY_ORDER: readonly InsertCategory[] = [
  "basic",
  "list",
  "media",
  "layout",
  "patterns",
  "format",
  "widget",
  "other",
  "template",
] as const;

/** セパレータを表示しないカテゴリ遷移ペア（挿入メニュー root のビジュアルグループ化用） */
export const MERGED_CATEGORY_PAIRS: ReadonlySet<string> = new Set([
  "media→layout",
  "layout→patterns",
]);

// =============================================================================
// Helpers for transform items ($ API only; caller must be inside editor.update)
// =============================================================================

function applySetBlocksType(createNode: () => ElementNode): void {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    $setBlocksType(selection, createNode);
  }
}

// =============================================================================
// Insert Items
// =============================================================================

const INSERT_ITEMS: readonly InsertItem[] = [
  // ========== 基本ブロック ==========
  {
    id: "paragraph",
    type: "transform",
    label: "本文",
    icon: Pilcrow,
    keywords: ["paragraph", "normal", "honbun", "text"],
    category: "basic",
    showInToolbar: false,
    showInPicker: true,
    applyInUpdate: () => applySetBlocksType(() => $createParagraphNode()),
  },
  {
    id: "h1",
    type: "transform",
    label: "見出し1",
    icon: Heading1,
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
    icon: Heading2,
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
    icon: Heading3,
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
    icon: Heading4,
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
    icon: TextQuote,
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
    icon: Code,
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
    icon: List,
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
    icon: ListOrdered,
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
    icon: ListChecks,
    keywords: ["check", "todo", "list", "chekkurisuto", "task"],
    category: "list",
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
  },

  // ========== メディア ==========
  {
    id: "image",
    type: "dialog",
    label: "画像",
    icon: ImageIcon,
    keywords: ["image", "photo", "picture", "gazou", "img"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "image",
  },
  {
    id: "inline-image",
    type: "dialog",
    label: "インライン画像",
    icon: ImageIcon,
    keywords: [
      "inline",
      "image",
      "float",
      "インライン",
      "画像",
      "フロート",
      "wrap",
    ],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "inlineImage",
  },
  {
    id: "youtube",
    type: "dialog",
    label: "YouTube",
    icon: SiYoutube,
    keywords: ["youtube", "video", "embed", "douga", "movie"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "youtube",
  },
  {
    id: "vimeo",
    type: "dialog",
    label: "Vimeo",
    icon: Video,
    keywords: ["vimeo", "video", "embed", "douga", "movie"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "vimeo",
  },
  {
    id: "x",
    type: "dialog",
    label: "X (Twitter)",
    icon: SiX,
    keywords: ["x", "twitter", "tweet", "embed", "social", "sns"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "x",
  },
  {
    id: "instagram",
    type: "dialog",
    label: "Instagram",
    icon: SiInstagram,
    keywords: ["instagram", "insta", "embed", "social", "sns", "photo"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "instagram",
  },
  {
    id: "mapEmbed",
    type: "dialog",
    label: "Google マップ",
    icon: Map,
    keywords: ["map", "google", "maps", "chizu", "embed", "location", "access"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "mapEmbed",
  },
  {
    id: "audio",
    type: "dialog",
    label: "音声プレイヤー",
    icon: Volume2,
    keywords: ["audio", "音声", "sound", "music", "音楽", "podcast"],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "audio",
  },
  {
    id: "file",
    type: "dialog",
    label: "ファイル添付",
    icon: Paperclip,
    keywords: [
      "file",
      "ファイル",
      "download",
      "ダウンロード",
      "attach",
      "添付",
    ],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "file",
  },
  {
    id: "figma",
    type: "dialog",
    label: "Figma",
    icon: SiFigma,
    keywords: ["figma", "デザイン", "design", "prototype", "プロトタイプ"],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "figma",
  },
  {
    id: "spotify",
    type: "dialog",
    label: "Spotify",
    icon: Music,
    keywords: [
      "spotify",
      "音楽",
      "music",
      "podcast",
      "ポッドキャスト",
      "track",
      "playlist",
    ],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "spotify",
  },
  {
    id: "gallery",
    type: "dialog",
    label: "画像ギャラリー",
    icon: LayoutGrid,
    keywords: ["gallery", "ギャラリー", "images", "画像", "photos", "写真"],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "gallery",
  },
  {
    id: "timeline",
    type: "dialog",
    label: "タイムライン",
    icon: Clock,
    keywords: [
      "timeline",
      "タイムライン",
      "history",
      "歴史",
      "chronology",
      "年表",
    ],
    category: "patterns",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "timeline",
  },
  {
    id: "pricingTable",
    type: "dialog",
    label: "料金比較表",
    icon: Table2,
    keywords: ["pricing", "price", "plan", "料金", "比較", "table", "プラン"],
    category: "patterns",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "pricingTable",
  },
  {
    id: "testimonial",
    type: "dialog",
    label: "口コミ・テスティモニアル",
    icon: MessageSquareQuote,
    keywords: [
      "testimonial",
      "review",
      "口コミ",
      "レビュー",
      "評価",
      "customer",
    ],
    category: "patterns",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "testimonial",
  },
  {
    id: "feature-icon-list",
    type: "dialog",
    label: "設備・特徴リスト",
    icon: Rows3,
    keywords: [
      "feature",
      "icon",
      "list",
      "amenity",
      "設備",
      "特徴",
      "アイコン",
      "リスト",
    ],
    category: "patterns",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "feature-icon-list",
  },
  {
    id: "table",
    type: "dialog",
    label: "テーブル",
    icon: Table,
    keywords: ["table", "grid", "hyou", "excel"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "table",
  },

  // ========== レイアウト ==========
  {
    id: "layout",
    type: "dialog",
    label: "カラム",
    icon: Columns,
    keywords: ["column", "layout", "grid", "karamu", "2column", "3column"],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "layout",
  },
  {
    id: "callout",
    type: "dialog",
    label: "コールアウト",
    icon: CircleAlert,
    keywords: ["callout", "alert", "note", "chuui", "info", "warning"],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "callout",
  },
  {
    id: "pullQuote",
    type: "dialog",
    label: "プルクォート",
    icon: Quote,
    keywords: ["pullquote", "quote", "inyou", "blockquote", "highlight"],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "pullQuote",
  },
  {
    id: "collapsible",
    type: "command",
    label: "折りたたみ",
    icon: ChevronsDownUp,
    keywords: [
      "collapsible",
      "accordion",
      "faq",
      "oritakamu",
      "toggle",
      "details",
    ],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined),
  },
  {
    id: "steps",
    type: "dialog",
    label: "ステップ",
    icon: Footprints,
    keywords: ["steps", "howto", "guide", "junban", "tejun", "process"],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "steps",
  },
  {
    id: "tabs",
    type: "dialog",
    label: "タブ",
    icon: PanelTop,
    keywords: ["tabs", "tabu", "switch", "panel", "toggle"],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "tabs",
  },
  {
    id: "cover",
    type: "dialog",
    label: "カバー",
    icon: PanelTop,
    keywords: [
      "cover",
      "hero",
      "background",
      "image",
      "背景",
      "カバー",
      "ヒーロー",
    ],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "cover",
  },

  // ========== テキスト変換 ==========
  {
    id: "lowercase",
    type: "command",
    label: "小文字",
    icon: CaseLower,
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
    icon: CaseUpper,
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
    icon: CaseSensitive,
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
    icon: MousePointerClick,
    keywords: ["button", "cta", "botan", "link", "action"],
    category: "widget",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "button",
  },
  {
    id: "bookmark",
    type: "dialog",
    label: "ブックマーク",
    icon: Link2,
    keywords: ["bookmark", "ogp", "card", "linkcard", "embed", "shiori"],
    category: "widget",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "bookmark",
  },

  // ========== その他 ==========
  {
    id: "hr",
    type: "command",
    label: "区切り線",
    icon: Minus,
    keywords: ["divider", "hr", "horizontal", "kugirisenn", "line"],
    category: "other",
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
  },
  {
    id: "toc",
    type: "command",
    label: "目次",
    icon: ListTree,
    keywords: ["toc", "table of contents", "mokuji", "heading", "navigation"],
    category: "other",
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_TOC_COMMAND, undefined),
  },
  {
    id: "pageBreak",
    type: "command",
    label: "ページ区切り",
    icon: Scissors,
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
    icon: Blocks,
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
    icon: Save,
    keywords: ["template", "save", "hozon", "テンプレート", "保存"],
    category: "template",
    showInToolbar: true,
    showInPicker: false,
    dialogId: "blockTemplateSave",
  },
];

// =============================================================================
// Query Functions
// =============================================================================

/** Toolbar用: showInToolbar=trueのアイテム。dialog系はopenDialogがある場合のみ含む */
export function getToolbarInsertItems(
  hasDialog: boolean,
): readonly InsertItem[] {
  return INSERT_ITEMS.filter((item) => {
    if (!item.showInToolbar) return false;
    if (item.type === "dialog" && !hasDialog) return false;
    return true;
  });
}

/** ComponentPicker用: showInPicker=trueのアイテム。dialog系はopenDialogがある場合のみ含む */
export function getPickerInsertItems(
  hasDialog: boolean,
): readonly InsertItem[] {
  return INSERT_ITEMS.filter((item) => {
    if (!item.showInPicker) return false;
    if (item.type === "dialog" && !hasDialog) return false;
    return true;
  });
}

/**
 * ツールバー「挿入」など、既存の update 外から挿入を実行する。
 * ダイアログ型は同期的に `openDialog` のみ。それ以外は 1 回の `editor.update` に集約する。
 */
export function executeInsertItem(
  item: InsertItem,
  editor: LexicalEditor,
  openDialog?: (id: DialogId) => void,
): void {
  if (item.type === "dialog") {
    openDialog?.(item.dialogId);
    return;
  }
  editor.update(() => {
    applyInsertItemInUpdate(item, editor, openDialog);
  });
}

/**
 * 既に `editor.update` のコールバック内にいるときに呼ぶ（スラッシュメニューと併用）。
 * ダイアログ型は `openDialog` を `queueMicrotask` で遅延し、同一 update 内の DOM 確定後に開く。
 */
export function applyInsertItemInUpdate(
  item: InsertItem,
  editor: LexicalEditor,
  openDialog?: (id: DialogId) => void,
): void {
  switch (item.type) {
    case "dialog": {
      const dialogId = item.dialogId;
      queueMicrotask(() => {
        openDialog?.(dialogId);
      });
      break;
    }
    case "command":
      item.dispatch(editor);
      break;
    case "transform":
      item.applyInUpdate();
      break;
  }
}
