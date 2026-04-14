"use client";

import { useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $convertFromMarkdownString } from "@lexical/markdown";
import { Button } from "@/admin/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui/dialog";
import { Textarea } from "@/admin/components/ui/textarea";
import { EDITOR_TRANSFORMERS } from "../../MarkdownTransformers";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MarkdownImportDialog({ open, onClose }: Props) {
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
