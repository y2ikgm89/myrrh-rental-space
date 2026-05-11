/**
 * Floating Block Selection Toolbar Plugin
 *
 * 複数ブロック粒度を跨ぐ範囲選択時にフローティングツールバーを表示する。
 * WordPress Gutenberg の「ブロックを複数選択 → ツールバーに Group アイコン」と
 * 同一のメンタルモデルを提供する block-level アクション UI。
 *
 * 設計方針:
 * - Lexical 公式 Playground の `FloatingTextFormatToolbarPlugin` の lifecycle /
 *   positioning パターンを踏襲（Playground には block 版がないため自作）。
 * - positioning は `FloatingTextFormatToolbarPlugin` と共通の
 *   `setFloatingElemPosition`（`./floating-toolbar/positioning.ts`）を使用し、
 *   配置挙動を text FT と完全に一致させる。
 * - 表示条件: `$isMultiBlockSelection()` が true（= deepest common ancestor の
 *   直接 block-level 子が 2 つ以上）。単一ブロック内の選択は Text FT に委ねる。
 *   Group ネストにも対応（Group 内の 2 段落選択時も Block FT が表示される）。
 *
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/FloatingTextFormatToolbarPlugin/index.tsx
 * @see https://wordpress.org/documentation/article/group-block/#converting-multiple-blocks-to-a-group-block
 */

"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { IconSquareMinus, IconSquarePlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import {
  $getSelectionBlockNodes,
  $isMultiBlockSelection,
} from "../lib/selection-helpers";
import {
  OPEN_GROUP_DIALOG_COMMAND,
  UNGROUP_GROUP_COMMAND,
} from "./GroupPlugin";
import { $isGroupNode } from "../nodes/GroupNode";
import { getDOMRangeRect, setFloatingElemPosition } from "./floating-toolbar";

// =============================================================================
// Toolbar Component
// =============================================================================

type FloatingBlockSelectionToolbarProps = {
  editor: LexicalEditor;
  anchorElem: HTMLElement;
  /** 選択が単一の祖先 Group に完全に内包されているか（= Ungroup 可能） */
  canUngroup: boolean;
};

function FloatingBlockSelectionToolbar({
  editor,
  anchorElem,
  canUngroup,
}: FloatingBlockSelectionToolbarProps) {
  const popupRef = useRef<HTMLDivElement>(null);

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

  // ドラッグ選択中はポインター透過（公式パターン）
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

  // スクロール / リサイズ対応
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

  // 選択変更時にポジション更新
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

  const handleGroup = () => {
    // 選択中のブロックキーを先にスナップショット（dialog にフォーカスが移ると選択が失われる）
    const keys: string[] = [];
    editor.read(() => {
      for (const node of $getSelectionBlockNodes()) {
        keys.push(node.getKey());
      }
    });
    editor.dispatchCommand(OPEN_GROUP_DIALOG_COMMAND, {
      targetNodeKeys: keys,
    });
  };

  const handleUngroup = () => {
    // ボタンフォーカスで選択が失われる可能性があるため、現在の選択から
    // 祖先 Group キーを先にスナップショットして targetNodeKey として渡す
    let groupKey: string | undefined;
    editor.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const group = $findMatchingParent(
        selection.anchor.getNode(),
        $isGroupNode,
      );
      if (group) groupKey = group.getKey();
    });
    editor.dispatchCommand(
      UNGROUP_GROUP_COMMAND,
      groupKey !== undefined ? { targetNodeKey: groupKey } : {},
    );
  };

  return (
    <div
      ref={popupRef}
      role="toolbar"
      aria-label="ブロック選択ツールバー"
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
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs"
        onClick={handleGroup}
        aria-label="選択したブロックをグループ化"
        title="選択したブロックをグループ化（Ctrl+Shift+G）"
      >
        <IconSquarePlus className="h-4 w-4" aria-hidden="true" />
        <span>グループ化</span>
      </Button>
      {canUngroup && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={handleUngroup}
          aria-label="現在のグループを解除"
          title="現在のグループを解除（Ctrl+Shift+Alt+G）"
        >
          <IconSquareMinus className="h-4 w-4" aria-hidden="true" />
          <span>グループ解除</span>
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// Hook (公式 FloatingTextFormatToolbarPlugin パターン準拠)
// =============================================================================

function useFloatingBlockSelectionToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
) {
  const [isMultiBlock, setIsMultiBlock] = useState(false);
  const [canUngroup, setCanUngroup] = useState(false);

  const updatePopup = useEffectEvent(() => {
    editor.read(() => {
      if (editor.isComposing()) {
        setIsMultiBlock(false);
        setCanUngroup(false);
        return;
      }

      const nativeSelection = window.getSelection();
      const rootElement = editor.getRootElement();

      if (
        !nativeSelection ||
        !rootElement ||
        !rootElement.contains(nativeSelection.anchorNode)
      ) {
        setIsMultiBlock(false);
        setCanUngroup(false);
        return;
      }

      const multiBlock = $isMultiBlockSelection();
      setIsMultiBlock(multiBlock);

      // Ungroup は multi-block 選択時のみ FT に表示（単一ブロックは DraggableBlock メニューで担当）
      if (multiBlock) {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          setCanUngroup($findMatchingParent(anchor, $isGroupNode) !== null);
        } else {
          setCanUngroup(false);
        }
      } else {
        setCanUngroup(false);
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

  if (!isMultiBlock) {
    return null;
  }

  return createPortal(
    <FloatingBlockSelectionToolbar
      editor={editor}
      anchorElem={anchorElem}
      canUngroup={canUngroup}
    />,
    anchorElem,
  );
}

// =============================================================================
// Plugin Component (public export)
// =============================================================================

export type FloatingBlockSelectionToolbarPluginProps = {
  anchorElem: HTMLElement;
};

export function FloatingBlockSelectionToolbarPlugin({
  anchorElem,
}: FloatingBlockSelectionToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();
  return useFloatingBlockSelectionToolbar(editor, anchorElem);
}
