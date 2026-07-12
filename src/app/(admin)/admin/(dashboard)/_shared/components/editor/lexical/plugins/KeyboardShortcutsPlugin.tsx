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
import {
  OPEN_GROUP_DIALOG_COMMAND,
  UNGROUP_GROUP_COMMAND,
} from "./GroupPlugin";
import { $getSelectionBlockNodes } from "../lib/selection-helpers";
import { IconKeyboard } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui/dialog";
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
  { keys: "Ctrl+Shift+G", description: "選択ブロックをグループ化" },
  { keys: "Ctrl+Shift+Alt+G", description: "現在のグループを解除" },
  { keys: "Ctrl+F", description: "検索" },
  { keys: "Ctrl+H", description: "置換" },
  { keys: "Ctrl+Shift+/", description: "ショートカット一覧" },
  {
    keys: "Ctrl+Shift+0",
    description: "ブロック設定パネル表示切替（本文ブロック用）",
  },
];

// =============================================================================
// Help Dialog
// =============================================================================

/**
 * Radix Dialog に一本化。role="dialog" + aria-modal / focus trap / initial
 * focus / focus 復帰 / Escape 閉じ / overlay click 閉じ / close button は
 * DialogContent SSoT が全て担うため、以前の自前 createPortal 実装は不要。
 */
export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconKeyboard className="h-4 w-4" aria-hidden="true" />
            キーボードショートカット
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto">
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
      </DialogContent>
    </Dialog>
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

        // Ctrl+Shift+Alt+G: 現在のグループを解除（Gutenberg の unwrap 相当）
        if (event.altKey && (event.key === "g" || event.key === "G")) {
          event.preventDefault();
          editor.dispatchCommand(UNGROUP_GROUP_COMMAND, {});
          return true;
        }

        // Ctrl+Shift+G: 選択ブロックをグループ化（ダイアログで装飾を選択）
        if (event.key === "g" || event.key === "G") {
          event.preventDefault();
          // 選択中のブロックキーを先にスナップショット（dialog フォーカスで選択が失われる）
          const keys: string[] = [];
          editor.read(() => {
            for (const node of $getSelectionBlockNodes()) {
              keys.push(node.getKey());
            }
          });
          editor.dispatchCommand(OPEN_GROUP_DIALOG_COMMAND, {
            targetNodeKeys: keys,
          });
          return true;
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

  return <ShortcutsHelpDialog open={showHelp} onOpenChange={setShowHelp} />;
}
