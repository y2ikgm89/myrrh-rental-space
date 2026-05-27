/**
 * Floating Text Format Toolbar Plugin
 *
 * テキスト選択時（= 単一ブロック粒度の range 選択）にフローティングツールバーを
 * 表示する。bold / italic / link / font-size / color 等のインラインフォーマット
 * 専用。複数ブロック粒度を跨ぐ選択では責務分離のため
 * `FloatingBlockSelectionToolbarPlugin` に表示を委ねる（`$isMultiBlockSelection`
 * が true のときは isText=false にして非表示）。
 *
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/FloatingTextFormatToolbarPlugin/index.tsx
 */

"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
  type ElementFormatType,
  type LexicalEditor,
  type TextFormatType,
} from "lexical";
import { $isCodeHighlightNode } from "@lexical/code";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import { IconLink } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import { Separator } from "@/admin/components/ui/separator";
import {
  HighlightCompact,
  getHighlightColorFromStyle,
  applyHighlightToSelection,
  type HighlightColor,
} from "./HighlightPlugin";
import {
  TextColorCompact,
  getTextColorFromStyle,
  applyTextColorToSelection,
  type TextColor,
} from "./TextColorPlugin";
import { $isMultiBlockSelection } from "../lib/selection-helpers";
import {
  AlignmentControl,
  DEFAULT_FONT_SIZE,
  ExtraActions,
  FontSizeControl,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  QuickFormatSection,
  calculateNextFontSize,
  getDOMRangeRect,
  isAlignmentType,
  setFloatingElemPosition,
  type AlignmentType,
} from "./floating-toolbar";

export { LinkHoverPreviewPlugin } from "./floating-toolbar";

// =============================================================================
// Floating Toolbar Component
// =============================================================================

type FloatingToolbarProps = {
  editor: LexicalEditor;
  anchorElem: HTMLElement;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  isSubscript: boolean;
  isSuperscript: boolean;
  isCode: boolean;
  isLink: boolean;
  fontSize: number;
  elementFormat: AlignmentType;
  highlightColor: HighlightColor;
  textColor: TextColor;
  currentTextColorValue: string;
  setIsLinkEditMode: (isLinkEditMode: boolean) => void;
  onAddComment?: (() => void) | undefined;
  onOpenRuby?: (() => void) | undefined;
  onOpenTooltip?: (() => void) | undefined;
};

function FloatingToolbar({
  editor,
  anchorElem,
  isBold,
  isItalic,
  isUnderline,
  isStrikethrough,
  isSubscript,
  isSuperscript,
  isCode,
  isLink,
  fontSize,
  elementFormat,
  highlightColor,
  textColor,
  currentTextColorValue,
  setIsLinkEditMode,
  onAddComment,
  onOpenRuby,
  onOpenTooltip,
}: FloatingToolbarProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // ポジション更新コールバック
  const updateFloatingToolbar = useEffectEvent(() => {
    const selection = $getSelection();
    const popup = popupRef.current;
    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();

    if (!popup || !nativeSelection || !rootElement) {
      return;
    }

    if (
      !$isRangeSelection(selection) ||
      nativeSelection.rangeCount === 0 ||
      selection.isCollapsed()
    ) {
      return;
    }

    const rangeRect = getDOMRangeRect(nativeSelection, rootElement);
    setFloatingElemPosition(rangeRect, popup, anchorElem);
  });

  // マウスイベントハンドラ（ドラッグ選択対応 - 公式パターン）
  useEffect(() => {
    const popup = popupRef.current;

    function mouseMoveListener(e: MouseEvent) {
      if (popup && (e.buttons === 1 || e.buttons === 3)) {
        if (popup.style.pointerEvents !== "none") {
          popup.style.pointerEvents = "none";
        }
      }
    }

    function mouseUpListener() {
      if (popup && popup.style.pointerEvents !== "auto") {
        popup.style.pointerEvents = "auto";
      }
    }

    document.addEventListener("mousemove", mouseMoveListener);
    document.addEventListener("mouseup", mouseUpListener);

    return () => {
      document.removeEventListener("mousemove", mouseMoveListener);
      document.removeEventListener("mouseup", mouseUpListener);
    };
  }, []);

  // スクロール・リサイズ時のポジション更新
  useEffect(() => {
    const scrollerElem = anchorElem.parentElement;

    const update = () => {
      editor.read(() => updateFloatingToolbar());
    };

    window.addEventListener("resize", update);
    scrollerElem?.addEventListener("scroll", update);

    return () => {
      window.removeEventListener("resize", update);
      scrollerElem?.removeEventListener("scroll", update);
    };
  }, [editor, anchorElem]);

  // 選択変更・エディタ更新時のポジション更新
  useEffect(() => {
    editor.read(() => updateFloatingToolbar());

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => updateFloatingToolbar());
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateFloatingToolbar();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const handleLinkClick = () => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      setIsLinkEditMode(true);
    }
  };

  const applyFontSize = (newSize: number) => {
    const clampedSize = Math.max(
      MIN_FONT_SIZE,
      Math.min(MAX_FONT_SIZE, newSize),
    );
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, {
          "font-size": `${clampedSize}px`,
        });
      }
    });
  };

  const handleFontSizeIncrement = () => {
    applyFontSize(calculateNextFontSize(fontSize, "increment"));
  };

  const handleFontSizeDecrement = () => {
    applyFontSize(calculateNextFontSize(fontSize, "decrement"));
  };

  const handleAlignmentChange = (format: ElementFormatType) => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
  };

  const handleHighlightChange = (color: HighlightColor) => {
    applyHighlightToSelection(editor, color);
  };

  const handleTextColorChange = (color: TextColor, customValue?: string) => {
    applyTextColorToSelection(editor, color, customValue);
  };

  return (
    <div
      ref={popupRef}
      className="absolute z-50 flex flex-wrap items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
      style={{
        top: 0,
        left: 0,
        opacity: 0,
        transform: "translate(-10000px, -10000px)",
      }}
    >
      <QuickFormatSection
        isBold={isBold}
        isItalic={isItalic}
        isUnderline={isUnderline}
        isStrikethrough={isStrikethrough}
        isSubscript={isSubscript}
        isSuperscript={isSuperscript}
        isCode={isCode}
        onFormat={formatText}
      />
      <Button
        type="button"
        variant={isLink ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={handleLinkClick}
        aria-label="リンク"
        title="リンク"
      >
        <IconLink className="h-4 w-4" />
      </Button>
      <HighlightCompact
        highlightColor={highlightColor}
        onColorSelect={handleHighlightChange}
      />
      <TextColorCompact
        textColor={textColor}
        currentColorValue={currentTextColorValue}
        onColorSelect={handleTextColorChange}
      />
      <ExtraActions
        {...(onAddComment && { onAddComment })}
        {...(onOpenRuby && { onOpenRuby })}
        {...(onOpenTooltip && { onOpenTooltip })}
      />
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <FontSizeControl
        fontSize={fontSize}
        onIncrement={handleFontSizeIncrement}
        onDecrement={handleFontSizeDecrement}
      />
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <AlignmentControl
        elementFormat={elementFormat}
        onChange={handleAlignmentChange}
      />
    </div>
  );
}

// =============================================================================
// useFloatingToolbar Hook (公式Playgroundパターン準拠)
// =============================================================================

function useFloatingToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  setIsLinkEditMode: (isLinkEditMode: boolean) => void,
  onAddComment?: () => void,
  onOpenRuby?: () => void,
  onOpenTooltip?: () => void,
) {
  const [isText, setIsText] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [elementFormat, setElementFormat] = useState<AlignmentType>("left");
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("none");
  const [textColor, setTextColor] = useState<TextColor>("none");
  const [currentTextColorValue, setCurrentTextColorValue] =
    useState<string>("#000000");

  const updatePopup = useEffectEvent(() => {
    editor.read(() => {
      if (editor.isComposing()) {
        return;
      }

      const selection = $getSelection();
      const nativeSelection = window.getSelection();
      const rootElement = editor.getRootElement();

      if (
        !nativeSelection ||
        !$isRangeSelection(selection) ||
        !rootElement ||
        !rootElement.contains(nativeSelection.anchorNode)
      ) {
        setIsText(false);
        return;
      }

      const anchorNode = selection.anchor.getNode();

      if ($isCodeHighlightNode(anchorNode)) {
        setIsText(false);
        return;
      }

      if (selection.isCollapsed()) {
        setIsText(false);
        return;
      }

      const isTextSelected =
        $isTextNode(anchorNode) || anchorNode.getType() === "paragraph";

      if (!isTextSelected) {
        setIsText(false);
        return;
      }

      // 複数ブロック粒度を跨ぐ選択は Block FT に委ねる（責務分離）。
      // WordPress Gutenberg と同じく、複数ブロック選択時はブロックレベル操作
      // （グループ化 / Callout化 等）の UI を優先する。
      if ($isMultiBlockSelection()) {
        setIsText(false);
        return;
      }

      setIsText(true);

      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsSubscript(selection.hasFormat("subscript"));
      setIsSuperscript(selection.hasFormat("superscript"));
      setIsCode(selection.hasFormat("code"));

      const node = selection.anchor.getNode();
      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));

      const currentFontSize = $getSelectionStyleValueForProperty(
        selection,
        "font-size",
        `${DEFAULT_FONT_SIZE}px`,
      );
      const sizeValue = parseInt(currentFontSize.replace(/px$/, ""), 10);
      setFontSize(isNaN(sizeValue) ? DEFAULT_FONT_SIZE : sizeValue);

      const topElement = node.getTopLevelElementOrThrow();
      const formatType = topElement.getFormatType();
      setElementFormat(isAlignmentType(formatType) ? formatType : "left");

      const bgColor = $getSelectionStyleValueForProperty(
        selection,
        "background-color",
        "inherit",
      );
      setHighlightColor(getHighlightColorFromStyle(bgColor));

      const color = $getSelectionStyleValueForProperty(
        selection,
        "color",
        "inherit",
      );
      setTextColor(getTextColorFromStyle(color));
      if (color && color !== "inherit" && color !== "transparent") {
        setCurrentTextColorValue(color);
      }
    });
  });

  useEffect(() => {
    const onSelectionChange = () => updatePopup();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => {
        updatePopup();
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updatePopup();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  if (!isText) {
    return null;
  }

  return createPortal(
    <FloatingToolbar
      editor={editor}
      anchorElem={anchorElem}
      isBold={isBold}
      isItalic={isItalic}
      isUnderline={isUnderline}
      isStrikethrough={isStrikethrough}
      isSubscript={isSubscript}
      isSuperscript={isSuperscript}
      isCode={isCode}
      isLink={isLink}
      fontSize={fontSize}
      elementFormat={elementFormat}
      highlightColor={highlightColor}
      textColor={textColor}
      currentTextColorValue={currentTextColorValue}
      setIsLinkEditMode={setIsLinkEditMode}
      {...(onAddComment && { onAddComment })}
      {...(onOpenRuby && { onOpenRuby })}
      {...(onOpenTooltip && { onOpenTooltip })}
    />,
    anchorElem,
  );
}

// =============================================================================
// Plugin Component (public export)
// =============================================================================

export type FloatingTextFormatToolbarPluginProps = {
  anchorElem: HTMLElement;
  setIsLinkEditMode: (isLinkEditMode: boolean) => void;
  /** コメント追加時のコールバック */
  onAddComment?: () => void;
  /** ルビ挿入ダイアログを開くコールバック */
  onOpenRuby?: () => void;
  /** ツールチップ挿入ダイアログを開くコールバック */
  onOpenTooltip?: () => void;
};

export function FloatingTextFormatToolbarPlugin({
  anchorElem,
  setIsLinkEditMode,
  onAddComment,
  onOpenRuby,
  onOpenTooltip,
}: FloatingTextFormatToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();
  return useFloatingToolbar(
    editor,
    anchorElem,
    setIsLinkEditMode,
    onAddComment,
    onOpenRuby,
    onOpenTooltip,
  );
}
