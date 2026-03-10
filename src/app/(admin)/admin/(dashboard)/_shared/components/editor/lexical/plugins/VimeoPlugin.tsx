/**
 * Vimeo Plugin
 *
 * @description Vimeo動画挿入ダイアログを提供するプラグイン
 */

"use client";

import { useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
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
import { $createVimeoNode, extractVimeoId } from "../nodes/VimeoNode";

// =============================================================================
// Types
// =============================================================================

type VimeoPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Component
// =============================================================================

export function VimeoPlugin({ isOpen, onClose }: VimeoPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const videoId = extractVimeoId(url);

    if (!videoId) {
      setError("有効なVimeo URLを入力してください");
      return;
    }

    editor.update(() => {
      const node = $createVimeoNode({ videoId });
      $insertNodeToNearestRoot(node);
    });

    setUrl("");
    setError("");
    onClose();
  };

  const handleClose = () => {
    setUrl("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vimeo動画を挿入</DialogTitle>
          <DialogDescription>
            Vimeo動画のURLを入力してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vimeo-url">Vimeo URL</Label>
            <Input
              id="vimeo-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              placeholder="https://vimeo.com/123456789"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!url}>
              挿入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
