/**
 * Inline Icon Plugin
 *
 * @description curated Tabler icon をインライン位置に挿入するダイアログプラグイン。
 *
 * `IconPickerDialog`（curation list grid + 検索 UI）を再利用して、
 * 選択時に `InlineIconNode` を `$insertNodes` で current selection に挿入する。
 *
 * 起動経路:
 * - `/` → 「アイコン」を選択 → ダイアログ起動
 * - ツールバー「挿入」→ 「アイコン」→ ダイアログ起動
 *
 * 既存 `RubyPlugin` / `TooltipPlugin` と同じ DialogPluginProps インターフェースに準拠。
 */

"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $insertNodes, $isRangeSelection } from "lexical";
import { IconPickerDialog } from "@/admin/components/icon-picker/IconPickerDialog";
import { $createInlineIconNode } from "../nodes/InlineIconNode";

// =============================================================================
// Types
// =============================================================================

type InlineIconPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Component
// =============================================================================

export function InlineIconPlugin({ isOpen, onClose }: InlineIconPluginProps) {
  const [editor] = useLexicalComposerContext();

  const handleConfirm = (name: string) => {
    if (!name) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // 選択テキストを先に削除（インライン DecoratorNode 挿入時の必須前処理）
        selection.removeText();
      }
      $insertNodes([$createInlineIconNode(name)]);
    });
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <IconPickerDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      value=""
      onConfirm={handleConfirm}
    />
  );
}
