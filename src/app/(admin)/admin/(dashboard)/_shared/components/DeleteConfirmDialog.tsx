"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { buttonVariants } from "./ui/button";

type DeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  itemName?: string;
  /**
   * 実行ボタンの文言。既定は「削除」。
   *
   * このダイアログは削除以外の「取り消せない操作」にも使う（イベントの一括
   * キャンセル、申込の一括キャンセル）。既定のままだと "キャンセルしますか？"
   * と尋ねながら実行ボタンが「削除」になり、しかも横の離脱ボタンも
   * 「キャンセル」なので、どちらが何をするのか読み取れなくなる。
   */
  confirmLabel?: string;
  onConfirm: () => void;
  isPending?: boolean;
};

/**
 * 統一された削除確認ダイアログ
 *
 * @example
 * ```tsx
 * <DeleteConfirmDialog
 *   open={deleteDialogOpen}
 *   onOpenChange={setDeleteDialogOpen}
 *   itemName="スペースA"
 *   onConfirm={handleDelete}
 *   isPending={isDeleting}
 * />
 * ```
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  confirmLabel = "削除",
  onConfirm,
  isPending = false,
}: DeleteConfirmDialogProps) {
  const displayTitle = title ?? "削除しますか？";
  const displayDescription =
    description ??
    (itemName
      ? `「${itemName}」を削除します。この操作は取り消せません。`
      : "この操作は取り消せません。");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{displayTitle}</AlertDialogTitle>
          <AlertDialogDescription>{displayDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className={buttonVariants({ variant: "destructive" })}
          >
            {isPending ? `${confirmLabel}中...` : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
