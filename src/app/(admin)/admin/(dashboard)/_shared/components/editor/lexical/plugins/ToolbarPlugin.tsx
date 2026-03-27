/**
 * Toolbar Plugin
 *
 * @description エディタツールバーを提供するプラグイン
 */

"use client";

import { Fragment, useEffect, useEffectEvent, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $findMatchingParent,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  mergeRegister,
  REDO_COMMAND,
  UNDO_COMMAND,
  type ElementFormatType,
  type LexicalEditor,
} from "lexical";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isHeadingNode,
  $createHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { $generateHtmlFromNodes } from "@lexical/html";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Code,
  FileDown,
  FileText,
  CircleHelp,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link,
  List,
  ListOrdered,
  Maximize,
  Minimize,
  PanelRightClose,
  PanelRightOpen,
  Pilcrow,
  Plus,
  Printer,
  Redo,
  Strikethrough,
  Subscript,
  Superscript,
  TextQuote,
  Underline,
  Undo,
  Upload,
} from "lucide-react";
import { Button } from "@/admin/components/ui/button";
import { Separator } from "@/admin/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/admin/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui/dialog";
import { Textarea } from "@/admin/components/ui/textarea";
import { $createQuoteNode, $isQuoteNode } from "@lexical/rich-text";
import { FontSizePlugin } from "./FontSizePlugin";
import { HighlightPlugin } from "./HighlightPlugin";
import { TextColorPlugin } from "./TextColorPlugin";
import { TextCasePlugin } from "./TextCasePlugin";
import { cn } from "@/shared/lib/cn";
import { entriesOf } from "@/shared/lib/serialize";
import {
  getToolbarInsertItems,
  executeInsertItem,
  MERGED_CATEGORY_PAIRS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type InsertItem,
} from "../config/insert-items";
import { EDITOR_TRANSFORMERS } from "../MarkdownTransformers";
import type { DialogId } from "../dialogs/dialog-types";
import type { LayoutToolbarContext } from "./LayoutToolbarSection";
import { ShortcutsHelpDialog } from "./KeyboardShortcutsPlugin";
import { useInspectorSidebar } from "../inspector/inspector-sidebar-context";
import {
  templateColumnsNarrowState,
  templateColumnsState,
} from "../nodes/LayoutContainerNode";
import { $findEnclosingLayoutContainer } from "./layout-navigation";
import { LayoutToolbarSection } from "./LayoutToolbarSection";

// =============================================================================
// Types
// =============================================================================

type ToolbarPluginProps = {
  openDialog?: (id: DialogId) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
};

type ToolbarInsertMenuItemsProps = {
  insertItems: readonly InsertItem[];
  editor: LexicalEditor;
  openDialog?: (id: DialogId) => void;
};

/** サブメニュー内を 2 カラムにする最小件数（Radix サブメニュー + 高密度グリッド） */
const TOOLBAR_INSERT_SUBMENU_GRID_MIN_ITEMS = 6;

function toolbarInsertSubContentClassName(itemCount: number): string {
  if (itemCount >= TOOLBAR_INSERT_SUBMENU_GRID_MIN_ITEMS) {
    return cn(
      "min-w-[272px] max-h-[min(70vh,440px)] overflow-y-auto p-1",
      "grid grid-cols-2 gap-0.5",
    );
  }
  return "min-w-[200px] max-h-[min(70vh,440px)] overflow-y-auto p-1";
}

function ToolbarInsertMenuItems({
  insertItems,
  editor,
  openDialog,
}: ToolbarInsertMenuItemsProps) {
  const categoriesWithItems = CATEGORY_ORDER.filter((category) =>
    insertItems.some((i) => i.category === category),
  );
  return categoriesWithItems.map((category, catIndex) => {
    const prevCategory = categoriesWithItems[catIndex - 1];
    const showSeparator =
      prevCategory !== undefined &&
      !MERGED_CATEGORY_PAIRS.has(`${prevCategory}→${category}`);
    const categoryItems = insertItems.filter((i) => i.category === category);

    if (categoryItems.length === 1) {
      const item = categoryItems[0];
      if (item === undefined) {
        return null;
      }
      return (
        <Fragment key={category}>
          {showSeparator && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={() => executeInsertItem(item, editor, openDialog)}
            className="flex items-center gap-2"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{item.label}</span>
          </DropdownMenuItem>
        </Fragment>
      );
    }

    return (
      <Fragment key={category}>
        {showSeparator && <DropdownMenuSeparator />}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <span className="min-w-0 flex-1 truncate text-left">
              {CATEGORY_LABELS[category]}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={4}
            alignOffset={-4}
            className={toolbarInsertSubContentClassName(categoryItems.length)}
          >
            {categoryItems.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => executeInsertItem(item, editor, openDialog)}
                className={cn(
                  "flex items-center gap-2",
                  categoryItems.length >=
                    TOOLBAR_INSERT_SUBMENU_GRID_MIN_ITEMS && "py-2 text-xs",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{item.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </Fragment>
    );
  });
}

type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "quote"
  | "ul"
  | "ol";

const BLOCK_TYPE_VALUES = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "h4",
  "quote",
  "ul",
  "ol",
] as const;
const BLOCK_TYPES = new Set<string>(BLOCK_TYPE_VALUES);

function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && BLOCK_TYPES.has(value);
}

type BlockTypeConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const BLOCK_TYPE_CONFIG: Record<BlockType, BlockTypeConfig> = {
  paragraph: { label: "本文", icon: Pilcrow },
  h1: { label: "見出し1", icon: Heading1 },
  h2: { label: "見出し2", icon: Heading2 },
  h3: { label: "見出し3", icon: Heading3 },
  h4: { label: "見出し4", icon: Heading4 },
  quote: { label: "引用", icon: TextQuote },
  ul: { label: "箇条書き", icon: List },
  ol: { label: "番号付き", icon: ListOrdered },
};

// テキスト配置オプション
type AlignmentType = "left" | "center" | "right" | "justify";

const ALIGNMENT_TYPE_VALUES = ["left", "center", "right", "justify"] as const;
const ALIGNMENT_TYPES = new Set<string>(ALIGNMENT_TYPE_VALUES);

function isAlignmentType(value: unknown): value is AlignmentType {
  return typeof value === "string" && ALIGNMENT_TYPES.has(value);
}

// HeadingTagType type guard (h1-h6 are valid Lexical heading tags)
const HEADING_TAG_VALUES = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const HEADING_TAGS = new Set<string>(HEADING_TAG_VALUES);

function isHeadingTag(value: unknown): value is HeadingTagType {
  return typeof value === "string" && HEADING_TAGS.has(value);
}

type AlignmentConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ALIGNMENT_CONFIG: Record<AlignmentType, AlignmentConfig> = {
  left: { label: "左揃え", icon: AlignLeft },
  center: { label: "中央揃え", icon: AlignCenter },
  right: { label: "右揃え", icon: AlignRight },
  justify: { label: "両端揃え", icon: AlignJustify },
};

// =============================================================================
// MarkdownImportDialog
// =============================================================================

function MarkdownImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [markdown, setMarkdown] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function handleImport() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    editor.update(() => {
      $convertFromMarkdownString(markdown, EDITOR_TRANSFORMERS);
    });
    onClose();
    setConfirmed(false);
    setMarkdown("");
  }

  function handleClose() {
    onClose();
    setConfirmed(false);
    setMarkdown("");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Markdown をインポート</DialogTitle>
          <DialogDescription>
            {confirmed
              ? "⚠️ インポートすると現在のコンテンツは置き換えられます。この操作は取り消せません。続行しますか？"
              : "Markdown テキストを貼り付けてください。"}
          </DialogDescription>
        </DialogHeader>
        {!confirmed && (
          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={10}
            placeholder={"# 見出し\n\n本文..."}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button
            onClick={handleImport}
            variant={confirmed ? "destructive" : "default"}
          >
            {confirmed ? "置き換える" : "次へ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ToolbarPlugin({
  openDialog,
  isFullscreen,
  onFullscreenToggle,
}: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const {
    isExpanded: isInspectorExpanded,
    isInspectorAvailable,
    toggle: toggleInspector,
  } = useInspectorSidebar();

  // 状態
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");
  const [elementFormat, setElementFormat] = useState<AlignmentType>("left");
  const [showMarkdownImport, setShowMarkdownImport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [layoutToolbarContext, setLayoutToolbarContext] =
    useState<LayoutToolbarContext | null>(null);

  // ツールバー状態を更新
  const updateToolbar = useEffectEvent(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      setLayoutToolbarContext(null);
      return;
    }

    // テキストフォーマット
    setIsBold(selection.hasFormat("bold"));
    setIsItalic(selection.hasFormat("italic"));
    setIsUnderline(selection.hasFormat("underline"));
    setIsStrikethrough(selection.hasFormat("strikethrough"));
    setIsSubscript(selection.hasFormat("subscript"));
    setIsSuperscript(selection.hasFormat("superscript"));

    // リンク
    const node = selection.anchor.getNode();
    const parent = node.getParent();
    setIsLink($isLinkNode(parent) || $isLinkNode(node));

    // ブロックタイプ
    const anchorNode = selection.anchor.getNode();
    let element =
      anchorNode.getKey() === "root"
        ? anchorNode
        : $findMatchingParent(anchorNode, (e) => {
            const parent = e.getParent();
            return parent !== null && $isRootOrShadowRoot(parent);
          });

    if (element === null) {
      element = anchorNode.getTopLevelElementOrThrow();
    }

    const elementKey = element.getKey();
    const elementDOM = editor.getElementByKey(elementKey);

    if (elementDOM !== null) {
      if ($isListNode(element)) {
        const parentList = $findMatchingParent(anchorNode, $isListNode);
        const type = parentList
          ? parentList.getListType()
          : element.getListType();
        setBlockType(type === "bullet" ? "ul" : "ol");
      } else {
        const type = $isHeadingNode(element)
          ? element.getTag()
          : $isQuoteNode(element)
            ? "quote"
            : "paragraph";
        // h5, h6 は対応外なのでparagraphにフォールバック
        setBlockType(isBlockType(type) ? type : "paragraph");
      }

      // テキスト配置を取得
      const topElement = anchorNode.getTopLevelElementOrThrow();
      const formatType = topElement.getFormatType();
      setElementFormat(isAlignmentType(formatType) ? formatType : "left");
    }

    const layoutNode = $findEnclosingLayoutContainer(anchorNode);
    if (layoutNode) {
      setLayoutToolbarContext({
        nodeKey: layoutNode.getKey(),
        wide: $getState(layoutNode, templateColumnsState),
        narrow: $getState(layoutNode, templateColumnsNarrowState),
      });
    } else {
      setLayoutToolbarContext(null);
    }
  });

  // リスナー登録
  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor]);

  // ハンドラー
  const handleUndo = () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  };

  const handleRedo = () => {
    editor.dispatchCommand(REDO_COMMAND, undefined);
  };

  const handleFormatBold = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  };

  const handleFormatItalic = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  };

  const handleFormatUnderline = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  };

  const handleFormatStrikethrough = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
  };

  const handleFormatSubscript = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript");
  };

  const handleFormatSuperscript = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript");
  };

  const handleInsertLink = () => {
    if (openDialog) {
      openDialog("link");
    } else {
      // フォールバック: ダイアログが提供されていない場合はリンク解除のみ
      if (isLink) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      }
    }
  };

  const handleInsertList = (type: "ul" | "ol") => {
    if (type === "ul") {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    }
  };

  const handleBlockTypeChange = (type: BlockType) => {
    if (type === "ul" || type === "ol") {
      handleInsertList(type);
      return;
    }

    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      if (type === "quote") {
        $setBlocksType(selection, () => $createQuoteNode());
        return;
      }

      if (type === "paragraph") {
        $setBlocksType(selection, () => $createParagraphNode());
        return;
      }

      // Heading (type is validated as HeadingTagType via isHeadingTag guard)
      if (isHeadingTag(type)) {
        $setBlocksType(selection, () => $createHeadingNode(type));
      }
    });
  };

  const handleAlignmentChange = (format: ElementFormatType) => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
  };

  // 書き出しハンドラー
  const handleCopyMarkdown = () => {
    editor.read(() => {
      const md = $convertToMarkdownString(EDITOR_TRANSFORMERS);
      void navigator.clipboard.writeText(md);
    });
  };

  const handleCopyHtml = () => {
    editor.read(() => {
      const html = $generateHtmlFromNodes(editor);
      void navigator.clipboard.writeText(html);
    });
  };

  const handleCopyPlainText = () => {
    editor.read(() => {
      const text = $getRoot().getTextContent();
      void navigator.clipboard.writeText(text);
    });
  };

  const handleOpenPrintPreview = () => {
    editor.read(() => {
      const html = $generateHtmlFromNodes(editor);
      const fullHtml =
        `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>印刷プレビュー</title>` +
        `<style>body{font-family:sans-serif;max-width:21cm;margin:2cm auto;padding:0 2.5cm}` +
        `@media print{body{margin:0}}</style></head><body>${html}</body></html>`;
      const blob = new Blob([fullHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (printWindow) {
        printWindow.addEventListener("load", () => URL.revokeObjectURL(url));
      } else {
        URL.revokeObjectURL(url);
      }
    });
  };

  // 挿入アイテム（configベース）
  const insertItems = getToolbarInsertItems(!!openDialog);

  // ドロップダウン表示用の現在値を事前計算（IIFE 回避）
  const { label: blockTypeLabel, icon: BlockTypeIcon } =
    BLOCK_TYPE_CONFIG[blockType];
  const { label: alignTypeLabel, icon: AlignTypeIcon } =
    ALIGNMENT_CONFIG[elementFormat];

  return (
    <>
      <div
        role="toolbar"
        aria-label="書式・挿入・書き出し"
        className="flex min-h-10 min-w-0 items-stretch border-b border-border bg-muted/40"
      >
        {/* 左右 flex-1 で主ツールバーをビューポート中央に配置 */}
        <div className="min-w-0 flex-1 basis-0 shrink" aria-hidden="true" />
        <div className="flex min-h-10 min-w-0 max-w-full items-center justify-center gap-0.5 overflow-x-auto overflow-y-hidden px-1 py-1 scrollbar-hide">
          {/* Undo/Redo */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleUndo}
            disabled={!canUndo}
            title="元に戻す"
          >
            <Undo className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleRedo}
            disabled={!canRedo}
            title="やり直す"
          >
            <Redo className="h-5 w-5 md:h-4 md:w-4" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Text Format */}
          <Button
            type="button"
            variant={isBold ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleFormatBold}
            title="太字"
          >
            <Bold className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button
            type="button"
            variant={isItalic ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleFormatItalic}
            title="斜体"
          >
            <Italic className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button
            type="button"
            variant={isUnderline ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleFormatUnderline}
            title="下線"
          >
            <Underline className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button
            type="button"
            variant={isStrikethrough ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleFormatStrikethrough}
            title="取り消し線"
          >
            <Strikethrough className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button
            type="button"
            variant={isSubscript ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleFormatSubscript}
            title="下付き文字"
          >
            <Subscript className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button
            type="button"
            variant={isSuperscript ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleFormatSuperscript}
            title="上付き文字"
          >
            <Superscript className="h-5 w-5 md:h-4 md:w-4" />
          </Button>

          {/* Highlight */}
          <HighlightPlugin />

          {/* Text Color */}
          <TextColorPlugin />

          {/* Text Case */}
          <TextCasePlugin />

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Font Size */}
          <FontSizePlugin />

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Block Type Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 min-w-[100px] justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <BlockTypeIcon className="h-4 w-4" />
                  <span className="text-xs">{blockTypeLabel}</span>
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              {entriesOf(BLOCK_TYPE_CONFIG).map(
                ([type, { label, icon: Icon }]) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => handleBlockTypeChange(type)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </span>
                    {blockType === type && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Text Alignment Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 min-w-[90px] justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <AlignTypeIcon className="h-4 w-4" />
                  <span className="text-xs">{alignTypeLabel}</span>
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {entriesOf(ALIGNMENT_CONFIG).map(
                ([type, { label, icon: Icon }]) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => handleAlignmentChange(type)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </span>
                    {elementFormat === type && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <LayoutToolbarSection
            editor={editor}
            context={layoutToolbarContext}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Link */}
          <Button
            type="button"
            variant={isLink ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleInsertLink}
            title="リンク"
          >
            <Link className="h-5 w-5 md:h-4 md:w-4" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Insert Dropdown */}
          {insertItems.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-xs">挿入</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                <ToolbarInsertMenuItems
                  insertItems={insertItems}
                  editor={editor}
                  {...(openDialog !== undefined ? { openDialog } : {})}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1"
              >
                <FileDown className="h-4 w-4" />
                <span className="text-xs">書き出し</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuItem
                onClick={handleCopyMarkdown}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                <span>Markdown をコピー</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleCopyHtml}
                className="flex items-center gap-2"
              >
                <Code className="h-4 w-4" />
                <span>HTML をコピー</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleCopyPlainText}
                className="flex items-center gap-2"
              >
                <AlignLeft className="h-4 w-4" />
                <span>プレーンテキストをコピー</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowMarkdownImport(true)}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                <span>Markdown をインポート</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleOpenPrintPreview}
                className="flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                <span>印刷プレビュー</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex min-w-0 flex-1 basis-0 shrink items-center justify-end">
          <div
            role="group"
            aria-label="ブロック設定と表示"
            className="flex shrink-0 items-center gap-0.5 border-l border-border px-1 py-1 pl-2"
          >
            {isInspectorAvailable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 md:h-8 md:w-8"
                aria-pressed={isInspectorExpanded}
                aria-controls="lexical-block-inspector-panel"
                aria-label={
                  isInspectorExpanded
                    ? "ブロック設定パネルを閉じる"
                    : "ブロック設定パネルを開く（本文中のブロック用）"
                }
                onClick={toggleInspector}
                title={
                  isInspectorExpanded
                    ? "ブロック設定を閉じる（Ctrl+Shift+0）"
                    : "ブロック設定を開く（本文ブロック用。タイトル・SEOはヘッダの設定）Ctrl+Shift+0"
                }
              >
                {isInspectorExpanded ? (
                  <PanelRightClose className="h-5 w-5 md:h-4 md:w-4" />
                ) : (
                  <PanelRightOpen className="h-5 w-5 md:h-4 md:w-4" />
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:h-8 md:w-8"
              onClick={() => setShowShortcuts(true)}
              title="キーボードショートカット (Ctrl+Shift+/)"
            >
              <CircleHelp className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:h-8 md:w-8"
              onClick={onFullscreenToggle}
              title={isFullscreen ? "全画面終了" : "全画面表示"}
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5 md:h-4 md:w-4" />
              ) : (
                <Maximize className="h-5 w-5 md:h-4 md:w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
      <MarkdownImportDialog
        open={showMarkdownImport}
        onClose={() => setShowMarkdownImport(false)}
      />
      {showShortcuts && (
        <ShortcutsHelpDialog onClose={() => setShowShortcuts(false)} />
      )}
    </>
  );
}
