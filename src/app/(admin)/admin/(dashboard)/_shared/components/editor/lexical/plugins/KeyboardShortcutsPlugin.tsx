/**
 * Keyboard Shortcuts Plugin
 *
 * @description エディタ用キーボードショートカットを登録するプラグイン
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import { $createHeadingNode, type HeadingTagType } from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { createPortal } from "react-dom";
import { X, Keyboard } from "lucide-react";
import { Button } from "@/admin/components/ui/button";
import type { DialogId } from "../dialogs/dialog-types";
import { useInspectorSidebar } from "../inspector/inspector-sidebar-context";

// =============================================================================
// Types
// =============================================================================

type ShortcutEntry = {
  keys: string;
  description: string;
};

const HEADING_TAGS = new Set<string>(["h1", "h2", "h3", "h4"]);

function isHeadingTag(value: string): value is HeadingTagType {
  return HEADING_TAGS.has(value);
}

// =============================================================================
// Constants
// =============================================================================

const SHORTCUT_LIST: ShortcutEntry[] = [
  { keys: "Ctrl+B", description: "太字" },
  { keys: "Ctrl+I", description: "斜体" },
  { keys: "Ctrl+U", description: "下線" },
  { keys: "Ctrl+Z", description: "元に戻す" },
  { keys: "Ctrl+Shift+Z", description: "やり直し" },
  { keys: "Ctrl+Shift+1", description: "見出し1" },
  { keys: "Ctrl+Shift+2", description: "見出し2" },
  { keys: "Ctrl+Shift+3", description: "見出し3" },
  { keys: "Ctrl+Shift+4", description: "見出し4" },
  { keys: "Ctrl+Shift+7", description: "番号付きリスト" },
  { keys: "Ctrl+Shift+8", description: "箇条書き" },
  { keys: "Ctrl+Shift+K", description: "リンク挿入" },
  { keys: "Ctrl+Shift+M", description: "画像挿入" },
  { keys: "Ctrl+F", description: "検索" },
  { keys: "Ctrl+H", description: "置換" },
  { keys: "Ctrl+Shift+/", description: "ショートカット一覧" },
  { keys: "Ctrl+Shift+0", description: "ブロック設定パネル表示切替" },
];

// =============================================================================
// Help Dialog
// =============================================================================

export function ShortcutsHelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Keyboard className="h-4 w-4" />
            <span>キーボードショートカット</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto p-4">
          <div className="space-y-2">
            {SHORTCUT_LIST.map((entry) => (
              <div
                key={entry.keys}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">
                  {entry.description}
                </span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {entry.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// =============================================================================
// Plugin
// =============================================================================

export function KeyboardShortcutsPlugin({
  openDialog,
}: {
  openDialog?: (id: DialogId) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [showHelp, setShowHelp] = useState(false);
  const { isInspectorAvailable, toggle: toggleInspector } =
    useInspectorSidebar();

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const isCtrl = event.ctrlKey || event.metaKey;

        if (!isCtrl || !event.shiftKey) return false;

        // Ctrl+Shift+0: ブロック設定パネル（インスペクター）開閉
        if (event.key === "0" || event.key === "Numpad0") {
          if (!isInspectorAvailable) return false;
          event.preventDefault();
          toggleInspector();
          return true;
        }

        // Ctrl+Shift+1~4: 見出し
        if (event.key >= "1" && event.key <= "4") {
          event.preventDefault();
          const tag = `h${event.key}`;
          if (!isHeadingTag(tag)) return false;
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createHeadingNode(tag));
            }
          });
          return true;
        }

        // Ctrl+Shift+7: 番号付きリスト
        if (event.key === "7") {
          event.preventDefault();
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
          return true;
        }

        // Ctrl+Shift+8: 箇条書き
        if (event.key === "8") {
          event.preventDefault();
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
          return true;
        }

        // Ctrl+Shift+K: リンク挿入
        if (event.key === "k" || event.key === "K") {
          if (openDialog) {
            event.preventDefault();
            openDialog("link");
            return true;
          }
        }

        // Ctrl+Shift+M: 画像挿入
        if (event.key === "m" || event.key === "M") {
          if (openDialog) {
            event.preventDefault();
            openDialog("image");
            return true;
          }
        }

        // Ctrl+Shift+/: ショートカット一覧
        if (event.key === "/") {
          event.preventDefault();
          setShowHelp(true);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, isInspectorAvailable, openDialog, toggleInspector]);

  if (!showHelp) return null;

  return <ShortcutsHelpDialog onClose={() => setShowHelp(false)} />;
}
