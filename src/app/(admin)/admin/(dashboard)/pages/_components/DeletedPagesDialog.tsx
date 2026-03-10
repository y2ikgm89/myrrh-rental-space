"use client";

/**
 * 削除済みページ復元ダイアログ
 *
 * ゴミ箱に移動されたページの一覧表示・復元・完全削除
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/admin/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/admin/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui/table";
import { restorePage, deletePagePermanently } from "@/admin/actions/page";
import type { PageData } from "@/shared/domain/pages/types";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { isMutationError } from "@/shared/lib/mutation-result";

async function fetchDeletedPages(): Promise<PageData[]> {
  const response = await fetch("/admin/api/pages/deleted", {
    credentials: "same-origin",
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "削除済みページの取得に失敗しました";
    throw new Error(message);
  }

  const data: PageData[] = await response.json();
  return data;
}

export function DeletedPagesDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pages, setPages] = useState<PageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      startTransition(() => setIsLoading(true));
      fetchDeletedPages()
        .then(setPages)
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "削除済みページの取得に失敗しました";
          toast.error(message);
        })
        .finally(() => startTransition(() => setIsLoading(false)));
    }
  }, [isOpen]);

  const handleRestore = (slug: string) => {
    startTransition(async () => {
      const result = await restorePage(slug);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("ページを復元しました");
      setPages((prev) => prev.filter((p) => p.slug !== slug));
      router.refresh();
    });
  };

  const handlePermanentDelete = (slug: string) => {
    startTransition(async () => {
      const result = await deletePagePermanently(slug);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("ページを完全に削除しました");
      setPages((prev) => prev.filter((p) => p.slug !== slug));
      setConfirmSlug(null);
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Trash2 className="h-4 w-4 mr-1" />
            ゴミ箱
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>削除済みページ</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Trash2 className="h-10 w-10 mb-3 opacity-50" />
              <p>削除済みページはありません</p>
            </div>
          ) : (
            <div className="overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>タイトル</TableHead>
                    <TableHead>スラッグ</TableHead>
                    <TableHead>削除日時</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => (
                    <TableRow key={page.id}>
                      <TableCell className="font-medium">
                        {page.title}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        /{page.slug}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTimeShort(page.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestore(page.slug)}
                            disabled={isPending}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            復元
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmSlug(page.slug)}
                            disabled={isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            完全削除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmSlug !== null}
        onOpenChange={() => setConfirmSlug(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              完全に削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。ページとそのセクションがすべて完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSlug && handlePermanentDelete(confirmSlug)}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  削除中...
                </>
              ) : (
                "完全に削除する"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
