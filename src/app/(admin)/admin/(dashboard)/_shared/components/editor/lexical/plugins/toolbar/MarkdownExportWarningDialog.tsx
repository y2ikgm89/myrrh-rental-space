/**
 * Markdown Export Warning Dialog
 *
 * @description Markdown コピー時、Markdown へ変換できない内容
 * （$hasUnrepresentableMarkdownContent が true を返すノード）が含まれる場合に
 * 表示する確認ダイアログ。「続行」でその時点の Markdown 文字列をコピーする
 */

"use client";

import { Button } from "@/admin/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function MarkdownExportWarningDialog({
  open,
  onClose,
  onConfirm,
}: Props) {
  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>一部の内容は Markdown に変換できません</DialogTitle>
          <DialogDescription>
            埋め込み（SNS・地図・ファイル等）やタブ・ステップ・カラムレイアウトなど、
            Markdown 形式では表現できない内容が含まれています。これらは Markdown
            へのコピー時に失われます。続行しますか？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            続行してコピー
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
