/**
 * Link Dialog Plugin
 *
 * @description リンク挿入・編集ダイアログを提供するプラグイン
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, $getSelection, $isRangeSelection } from "lexical";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
} from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type LinkDialogPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Component
// =============================================================================

export function LinkDialogPlugin({ isOpen, onClose }: LinkDialogPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [url, setUrl] = useState("");
  const [isEdit, setIsEdit] = useState(false);

  // ダイアログを開いた時に現在のリンクURLを取得
  useEffect(() => {
    if (!isOpen) return;

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const node = selection.anchor.getNode();
      const linkNode = $findMatchingParent(node, $isLinkNode);

      if (linkNode) {
        setUrl(linkNode.getURL());
        setIsEdit(true);
      } else {
        setUrl("");
        setIsEdit(false);
      }
    });
  }, [editor, isOpen]);

  const handleSubmit = () => {
    if (!url.trim()) {
      // URLが空の場合はリンクを解除
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      // URLを設定
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    }

    setUrl("");
    onClose();
  };

  const handleRemoveLink = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setUrl("");
    onClose();
  };

  const handleClose = () => {
    setUrl("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "リンクを編集" : "リンクを挿入"}</DialogTitle>
          <DialogDescription>リンク先のURLを入力してください</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2">
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleRemoveLink}
              >
                リンクを解除
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit}>
              {isEdit ? "更新" : "挿入"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * リンクダイアログの状態管理フック
 */
export function useLinkDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const openLinkDialog = () => setIsOpen(true);
  const closeLinkDialog = () => setIsOpen(false);

  return {
    isLinkDialogOpen: isOpen,
    openLinkDialog,
    closeLinkDialog,
  };
}
