"use client";

import { useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $convertFromMarkdownString } from "@lexical/markdown";
import { IconLoader2 } from "@tabler/icons-react";
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

// 巨大な Markdown の貼り付けによるブラウザフリーズを抑えるための上限
const MARKDOWN_IMPORT_MAX_LENGTH = 200_000;

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MarkdownImportDialog({ open, onClose }: Props) {
  const [editor] = useLexicalComposerContext();
  const [markdown, setMarkdown] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  function handleImport() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setIsImporting(true);
    // $convertFromMarkdownString は同期処理のため、spinner を描画してから
    // 次フレームで変換を実行する（体感のフリーズ感を減らす）
    setTimeout(() => {
      editor.update(() => {
        $convertFromMarkdownString(markdown, EDITOR_TRANSFORMERS);
      });
      setIsImporting(false);
      onClose();
      setConfirmed(false);
      setMarkdown("");
    }, 0);
  }

  function handleClose() {
    if (isImporting) return;
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
            maxLength={MARKDOWN_IMPORT_MAX_LENGTH}
            placeholder={"# 見出し\n\n本文..."}
            disabled={isImporting}
          />
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleImport}
            variant={confirmed ? "destructive" : "default"}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
                インポート中...
              </>
            ) : confirmed ? (
              "置き換える"
            ) : (
              "次へ"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
