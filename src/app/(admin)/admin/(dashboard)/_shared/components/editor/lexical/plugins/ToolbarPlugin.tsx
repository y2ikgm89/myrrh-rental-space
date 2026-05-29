/**
 * Toolbar Plugin
 *
 * @description エディタツールバーを提供するプラグイン
 */

"use client";

import { useEffect, useEffectEvent, useState } from "react";
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
} from "lexical";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $convertToMarkdownString } from "@lexical/markdown";
import { $generateHtmlFromNodes } from "@lexical/html";
import { IconLink } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import { Separator } from "@/admin/components/ui/separator";
import { openExternalTab } from "@/admin/lib/open-external-tab";
import { FontSizePlugin } from "./FontSizePlugin";
import { HighlightPlugin } from "./HighlightPlugin";
import { TextColorPlugin } from "./TextColorPlugin";
import { TextCasePlugin } from "./TextCasePlugin";
import { getToolbarInsertItems } from "../config/insert-items";
import { EDITOR_TRANSFORMERS } from "../MarkdownTransformers";
import type { DialogId } from "../dialogs/dialog-types";
import type { LayoutToolbarContext } from "./LayoutToolbarSection";
import { LayoutToolbarSection } from "./LayoutToolbarSection";
import { ShortcutsHelpDialog } from "./KeyboardShortcutsPlugin";
import { useInspectorSidebar } from "../inspector/inspector-sidebar-context";
import {
  templateColumnsNarrowState,
  templateColumnsState,
} from "../nodes/LayoutContainerNode";
import { $findEnclosingLayoutContainer } from "./layout-navigation";
import {
  AlignmentSection,
  BlockTypeSection,
  ExportSection,
  FormatSection,
  HistorySection,
  InsertSection,
  InspectorControls,
  MarkdownImportDialog,
  isAlignmentType,
  isBlockType,
  isHeadingTag,
  type AlignmentType,
  type BlockType,
} from "./toolbar";

type ToolbarPluginProps = {
  openDialog?: (id: DialogId) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
};

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

  const updateToolbar = useEffectEvent(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      setLayoutToolbarContext(null);
      return;
    }

    setIsBold(selection.hasFormat("bold"));
    setIsItalic(selection.hasFormat("italic"));
    setIsUnderline(selection.hasFormat("underline"));
    setIsStrikethrough(selection.hasFormat("strikethrough"));
    setIsSubscript(selection.hasFormat("subscript"));
    setIsSuperscript(selection.hasFormat("superscript"));

    const node = selection.anchor.getNode();
    const parent = node.getParent();
    setIsLink($isLinkNode(parent) || $isLinkNode(node));

    const anchorNode = selection.anchor.getNode();
    let element =
      anchorNode.getKey() === "root"
        ? anchorNode
        : $findMatchingParent(anchorNode, (e) => {
            const parentElement = e.getParent();
            return parentElement !== null && $isRootOrShadowRoot(parentElement);
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
        setBlockType(isBlockType(type) ? type : "paragraph");
      }

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

  const handleUndo = () => editor.dispatchCommand(UNDO_COMMAND, undefined);
  const handleRedo = () => editor.dispatchCommand(REDO_COMMAND, undefined);
  const handleFormatBold = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  const handleFormatItalic = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  const handleFormatUnderline = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  const handleFormatStrikethrough = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
  const handleFormatSubscript = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript");
  const handleFormatSuperscript = () =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript");

  const handleInsertLink = () => {
    if (openDialog) {
      openDialog("link");
    } else if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
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

      if (isHeadingTag(type)) {
        $setBlocksType(selection, () => $createHeadingNode(type));
      }
    });
  };

  const handleAlignmentChange = (format: ElementFormatType) => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
  };

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
      const printWindow = openExternalTab(url);
      if (printWindow) {
        printWindow.addEventListener("load", () => URL.revokeObjectURL(url));
      } else {
        URL.revokeObjectURL(url);
      }
    });
  };

  const insertItems = getToolbarInsertItems(!!openDialog);

  return (
    <>
      <div
        role="toolbar"
        aria-label="書式・挿入・書き出し"
        className="grid min-h-11 min-w-0 grid-cols-[1fr_auto_1fr] items-stretch border-b border-border bg-muted/40"
      >
        <div aria-hidden="true" />
        <div className="flex min-h-11 min-w-0 max-w-full items-center justify-center gap-0.5 overflow-x-auto overflow-y-hidden px-1 py-1 scrollbar-hide">
          <HistorySection
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          <FormatSection
            isBold={isBold}
            isItalic={isItalic}
            isUnderline={isUnderline}
            isStrikethrough={isStrikethrough}
            isSubscript={isSubscript}
            isSuperscript={isSuperscript}
            onBold={handleFormatBold}
            onItalic={handleFormatItalic}
            onUnderline={handleFormatUnderline}
            onStrikethrough={handleFormatStrikethrough}
            onSubscript={handleFormatSubscript}
            onSuperscript={handleFormatSuperscript}
          />

          <HighlightPlugin />
          <TextColorPlugin />
          <TextCasePlugin />

          <Separator orientation="vertical" className="mx-1 h-6" />

          <FontSizePlugin />

          <Separator orientation="vertical" className="mx-1 h-6" />

          <BlockTypeSection
            blockType={blockType}
            onChange={handleBlockTypeChange}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          <AlignmentSection
            elementFormat={elementFormat}
            onChange={handleAlignmentChange}
          />

          <LayoutToolbarSection
            editor={editor}
            context={layoutToolbarContext}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Button
            type="button"
            variant={isLink ? "secondary" : "ghost"}
            size="icon"
            className="h-10 w-10 md:h-8 md:w-8"
            onClick={handleInsertLink}
            title="リンク"
          >
            <IconLink className="h-5 w-5 md:h-4 md:w-4" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <InsertSection
            insertItems={insertItems}
            editor={editor}
            {...(openDialog !== undefined ? { openDialog } : {})}
          />

          <ExportSection
            onCopyMarkdown={handleCopyMarkdown}
            onCopyHtml={handleCopyHtml}
            onCopyPlainText={handleCopyPlainText}
            onMarkdownImport={() => setShowMarkdownImport(true)}
            onOpenPrintPreview={handleOpenPrintPreview}
          />
        </div>
        <div className="flex items-center justify-end">
          <InspectorControls
            isInspectorAvailable={isInspectorAvailable}
            isInspectorExpanded={isInspectorExpanded}
            onToggleInspector={toggleInspector}
            onShowShortcuts={() => setShowShortcuts(true)}
            isFullscreen={isFullscreen}
            onFullscreenToggle={onFullscreenToggle}
          />
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
