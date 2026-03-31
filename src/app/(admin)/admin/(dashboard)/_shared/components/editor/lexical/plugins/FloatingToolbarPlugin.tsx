/**
 * Floating Toolbar Plugin
 *
 * テキスト選択時にフローティングツールバーを表示
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
import { IconAlignCenter, IconAlignJustified, IconAlignLeft, IconAlignRight, IconBold, IconCode, IconExternalLink, IconItalic, IconLink, IconMessagePlus, IconMinus, IconPlus, IconStrikethrough, IconSubscript, IconSuperscript, IconUnderline } from "@tabler/icons-react";
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

// =============================================================================
// Font Size Constants (公式Playgroundパターン準拠)
// =============================================================================

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;
const DEFAULT_FONT_SIZE = 16;

function calculateNextFontSize(
  currentSize: number,
  direction: "increment" | "decrement",
): number {
  let step: number;
  if (currentSize >= 48) {
    step = 12;
  } else if (currentSize >= 24) {
    step = 4;
  } else if (currentSize >= 14) {
    step = 2;
  } else {
    step = 1;
  }
  const nextSize =
    direction === "increment" ? currentSize + step : currentSize - step;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, nextSize));
}

// =============================================================================
// Utilities (公式Playgroundパターン準拠)
// =============================================================================

/**
 * DOM選択範囲の矩形を取得
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/utils/getDOMRangeRect.ts
 */
function getDOMRangeRect(
  nativeSelection: Selection,
  rootElement: HTMLElement,
): DOMRect {
  const domRange = nativeSelection.getRangeAt(0);

  if (nativeSelection.anchorNode === rootElement) {
    let inner = rootElement;
    while (inner.firstElementChild instanceof HTMLElement) {
      inner = inner.firstElementChild;
    }
    return inner.getBoundingClientRect();
  }

  return domRange.getBoundingClientRect();
}

/**
 * フローティング要素の位置を設定
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/utils/setFloatingElemPosition.ts
 */
function setFloatingElemPosition(
  targetRect: DOMRect | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  verticalGap: number = 10,
  horizontalOffset: number = 5,
): void {
  const scrollerElem = anchorElem.parentElement;

  if (targetRect === null || !scrollerElem) {
    floatingElem.style.opacity = "0";
    floatingElem.style.transform = "translate(-10000px, -10000px)";
    return;
  }

  const floatingElemRect = floatingElem.getBoundingClientRect();
  const anchorElementRect = anchorElem.getBoundingClientRect();
  const editorScrollerRect = scrollerElem.getBoundingClientRect();

  let top = targetRect.top - floatingElemRect.height - verticalGap;
  let left = targetRect.left - horizontalOffset;

  // 固定ツールバーに重なる場合は選択テキストの下に配置
  if (top < anchorElementRect.top) {
    top = targetRect.bottom + verticalGap;
  }

  // 左端境界チェック
  if (left < editorScrollerRect.left) {
    left = editorScrollerRect.left + horizontalOffset;
  }

  // 右端境界チェック
  if (left + floatingElemRect.width > editorScrollerRect.right) {
    left = editorScrollerRect.right - floatingElemRect.width - horizontalOffset;
  }

  // アンカー要素からの相対位置に変換
  top -= anchorElementRect.top;
  left -= anchorElementRect.left;

  floatingElem.style.opacity = "1";
  floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}

// =============================================================================
// Floating Toolbar Component (公式Playgroundパターン準拠)
// =============================================================================

type AlignmentType = "left" | "center" | "right" | "justify";

const ALIGNMENT_TYPES = new Set<string>(["left", "center", "right", "justify"]);

function isAlignmentType(value: string): value is AlignmentType {
  return ALIGNMENT_TYPES.has(value);
}

const ALIGNMENT_OPTIONS = [
  { type: "left" as const, label: "左揃え", icon: IconAlignLeft },
  { type: "center" as const, label: "中央揃え", icon: IconAlignCenter },
  { type: "right" as const, label: "右揃え", icon: IconAlignRight },
  { type: "justify" as const, label: "両端揃え", icon: IconAlignJustified },
];

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
        // ドラッグ中はポインターイベントを無効化
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
      editor.getEditorState().read(() => updateFloatingToolbar());
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
    editor.getEditorState().read(() => updateFloatingToolbar());

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

  // フォーマットコマンドディスパッチ
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

  // フォントサイズ変更ハンドラー
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
    const nextSize = calculateNextFontSize(fontSize, "increment");
    applyFontSize(nextSize);
  };

  const handleFontSizeDecrement = () => {
    const nextSize = calculateNextFontSize(fontSize, "decrement");
    applyFontSize(nextSize);
  };

  // テキスト配置変更ハンドラー
  const handleAlignmentChange = (format: ElementFormatType) => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
  };

  // ハイライト変更ハンドラー
  const handleHighlightChange = (color: HighlightColor) => {
    applyHighlightToSelection(editor, color);
  };

  // 文字色変更ハンドラー
  const handleTextColorChange = (color: TextColor, customValue?: string) => {
    applyTextColorToSelection(editor, color, customValue);
  };

  return (
    <div
      ref={popupRef}
      className="absolute z-50 flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
      style={{
        top: 0,
        left: 0,
        opacity: 0,
        transform: "translate(-10000px, -10000px)",
      }}
    >
      <Button
        type="button"
        variant={isBold ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => formatText("bold")}
        aria-label="太字"
        title="太字"
      >
        <IconBold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isItalic ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => formatText("italic")}
        aria-label="斜体"
        title="斜体"
      >
        <IconItalic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isUnderline ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => formatText("underline")}
        aria-label="下線"
        title="下線"
      >
        <IconUnderline className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isStrikethrough ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => formatText("strikethrough")}
        aria-label="取り消し線"
        title="取り消し線"
      >
        <IconStrikethrough className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isSubscript ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => formatText("subscript")}
        aria-label="下付き"
        title="下付き"
      >
        <IconSubscript className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isSuperscript ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => formatText("superscript")}
        aria-label="上付き"
        title="上付き"
      >
        <IconSuperscript className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isCode ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => formatText("code")}
        aria-label="コード"
        title="コード"
      >
        <IconCode className="h-4 w-4" />
      </Button>
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
      {onAddComment && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onAddComment}
          aria-label="コメントを追加"
          title="コメントを追加"
        >
          <IconMessagePlus className="h-4 w-4" />
        </Button>
      )}
      {onOpenRuby && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-xs font-bold"
          onClick={onOpenRuby}
          aria-label="ルビを挿入"
          title="ルビを挿入"
        >
          ルビ
        </Button>
      )}
      {onOpenTooltip && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-xs font-bold"
          onClick={onOpenTooltip}
          aria-label="ツールチップを挿入"
          title="ツールチップを挿入"
        >
          TIP
        </Button>
      )}
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleFontSizeDecrement}
          disabled={fontSize <= MIN_FONT_SIZE}
          aria-label="フォントサイズを小さく"
          title="フォントサイズを小さく"
        >
          <IconMinus className="h-3 w-3" />
        </Button>
        <span className="min-w-[2rem] text-center text-xs tabular-nums">
          {fontSize}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleFontSizeIncrement}
          disabled={fontSize >= MAX_FONT_SIZE}
          aria-label="フォントサイズを大きく"
          title="フォントサイズを大きく"
        >
          <IconPlus className="h-3 w-3" />
        </Button>
      </div>
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <div className="flex items-center gap-0.5">
        {ALIGNMENT_OPTIONS.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            type="button"
            variant={elementFormat === type ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => handleAlignmentChange(type)}
            aria-label={label}
            title={label}
          >
            <Icon className="h-3 w-3" />
          </Button>
        ))}
      </div>
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
  // 公式パターン: 個別のuseStateで各フォーマット状態を管理
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
    editor.getEditorState().read(() => {
      // IME入力中は非表示（公式パターン）
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

      // コードハイライトノード内では非表示
      if ($isCodeHighlightNode(anchorNode)) {
        setIsText(false);
        return;
      }

      // 折りたたまれた選択（カーソルのみ）では非表示
      if (selection.isCollapsed()) {
        setIsText(false);
        return;
      }

      // テキストノードまたは段落ノードが選択されているか確認
      const isTextSelected =
        $isTextNode(anchorNode) || anchorNode.getType() === "paragraph";

      if (!isTextSelected) {
        setIsText(false);
        return;
      }

      setIsText(true);

      // フォーマット状態を更新
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsSubscript(selection.hasFormat("subscript"));
      setIsSuperscript(selection.hasFormat("superscript"));
      setIsCode(selection.hasFormat("code"));

      // リンク状態をチェック
      const node = selection.anchor.getNode();
      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));

      // フォントサイズを取得
      const currentFontSize = $getSelectionStyleValueForProperty(
        selection,
        "font-size",
        `${DEFAULT_FONT_SIZE}px`,
      );
      const sizeValue = parseInt(currentFontSize.replace(/px$/, ""), 10);
      setFontSize(isNaN(sizeValue) ? DEFAULT_FONT_SIZE : sizeValue);

      // テキスト配置を取得
      const topElement = node.getTopLevelElementOrThrow();
      const formatType = topElement.getFormatType();
      setElementFormat(isAlignmentType(formatType) ? formatType : "left");

      // ハイライト色を取得
      const bgColor = $getSelectionStyleValueForProperty(
        selection,
        "background-color",
        "inherit",
      );
      setHighlightColor(getHighlightColorFromStyle(bgColor));

      // 文字色を取得
      const color = $getSelectionStyleValueForProperty(
        selection,
        "color",
        "inherit",
      );
      setTextColor(getTextColorFromStyle(color));
      // カスタム色の場合は値を保存
      if (color && color !== "inherit" && color !== "transparent") {
        setCurrentTextColorValue(color);
      }
    });
  });

  // ドキュメント選択変更イベント
  useEffect(() => {
    const onSelectionChange = () => updatePopup();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  // エディタ更新・選択変更コマンド
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
// Internal Plugin Component
// =============================================================================

function FloatingToolbarInner({
  anchorElem,
  setIsLinkEditMode,
  onAddComment,
  onOpenRuby,
  onOpenTooltip,
}: {
  anchorElem: HTMLElement;
  setIsLinkEditMode: (isLinkEditMode: boolean) => void;
  onAddComment?: () => void;
  onOpenRuby?: () => void;
  onOpenTooltip?: () => void;
}) {
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

// =============================================================================
// Plugin Component (公式エクスポートパターン)
// =============================================================================

export type FloatingToolbarPluginProps = {
  anchorElem: HTMLElement;
  setIsLinkEditMode?: (isLinkEditMode: boolean) => void;
  /** コメント追加時のコールバック */
  onAddComment?: () => void;
  /** ルビ挿入ダイアログを開くコールバック */
  onOpenRuby?: () => void;
  /** ツールチップ挿入ダイアログを開くコールバック */
  onOpenTooltip?: () => void;
};

export function FloatingToolbarPlugin({
  anchorElem,
  setIsLinkEditMode,
  onAddComment,
  onOpenRuby,
  onOpenTooltip,
}: FloatingToolbarPluginProps) {
  const handleSetIsLinkEditMode = (isLinkEditMode: boolean) => {
    setIsLinkEditMode?.(isLinkEditMode);
  };

  return (
    <FloatingToolbarInner
      anchorElem={anchorElem}
      setIsLinkEditMode={handleSetIsLinkEditMode}
      {...(onAddComment && { onAddComment })}
      {...(onOpenRuby && { onOpenRuby })}
      {...(onOpenTooltip && { onOpenTooltip })}
    />
  );
}

// =============================================================================
// Link Hover Preview Plugin
// =============================================================================

type LinkPreviewState = {
  url: string;
  position: { top: number; left: number };
};

function getElementFromTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function LinkHoverPreview({ url, position }: LinkPreviewState) {
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }
  const isExternal = !url.startsWith("/");

  return (
    <div
      className="fixed z-50 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md flex items-center gap-2 pointer-events-none"
      style={{ top: position.top, left: position.left }}
    >
      {isExternal && (
        <IconExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
      <span className="text-muted-foreground text-xs">{domain}</span>
      <span className="max-w-[200px] truncate text-xs">{url}</span>
    </div>
  );
}

export function LinkHoverPreviewPlugin() {
  const [editor] = useLexicalComposerContext();
  const [previewState, setPreviewState] = useState<LinkPreviewState | null>(
    null,
  );

  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    function handleMouseOver(e: MouseEvent) {
      const target = getElementFromTarget(e.target);
      const linkEl = target?.closest("a[href]");
      if (!(linkEl instanceof HTMLAnchorElement)) return;
      const url = linkEl.getAttribute("href") ?? linkEl.href;
      if (!url) return;
      const rect = linkEl.getBoundingClientRect();
      setPreviewState({
        url,
        position: { top: rect.bottom + 6, left: rect.left },
      });
    }

    function handleMouseOut(e: MouseEvent) {
      const relatedTarget = getElementFromTarget(e.relatedTarget);
      if (!relatedTarget?.closest("a[href]")) {
        setPreviewState(null);
      }
    }

    rootElement.addEventListener("mouseover", handleMouseOver);
    rootElement.addEventListener("mouseout", handleMouseOut);

    return () => {
      rootElement.removeEventListener("mouseover", handleMouseOver);
      rootElement.removeEventListener("mouseout", handleMouseOut);
    };
  }, [editor]);

  if (!previewState) return null;

  return createPortal(<LinkHoverPreview {...previewState} />, document.body);
}
