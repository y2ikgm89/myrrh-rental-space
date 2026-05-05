"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconRestore, IconTrash } from "@tabler/icons-react";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { isMutationError } from "@/shared/lib/mutation-result";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { TERMS_TYPE_LABELS } from "@/shared/lib/validations/terms";
import { hardDeleteTerms, restoreTerms } from "@/admin/actions/terms";
import type { AdminTermsListItem } from "@/shared/domain/terms/admin-queries";

interface TermsTrashTableProps {
  readonly items: AdminTermsListItem[];
}

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export function TermsTrashTable({ items }: TermsTrashTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore(id: string, title: string) {
    startTransition(async () => {
      try {
        const result = await restoreTerms(id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success(`「${title}」を復元しました（下書きとして戻ります）`);
        router.refresh();
      } catch (error) {
        logger.error("規約復元エラー", { error: getErrorMessage(error) });
        toast.error("復元中にエラーが発生しました");
      }
    });
  }

  function handleHardDelete(id: string, title: string) {
    if (
      !window.confirm(
        `「${title}」を完全に削除しますか？\nこの操作は取り消せません（同意記録に紐づきがある場合は失敗します）。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await hardDeleteTerms(id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("規約を完全に削除しました");
        router.refresh();
      } catch (error) {
        logger.error("規約物理削除エラー", { error: getErrorMessage(error) });
        toast.error("削除中にエラーが発生しました");
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">ゴミ箱は空です</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead>タイプ</TableHead>
              <TableHead className="hidden md:table-cell">スラッグ</TableHead>
              <TableHead className="hidden lg:table-cell">削除日時</TableHead>
              <TableHead className="text-right">同意数</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {TERMS_TYPE_LABELS[item.type] ?? item.type}
                  </Badge>
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                  {item.slug}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {item.deletedAt
                    ? dateFormatter.format(new Date(item.deletedAt))
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.agreementsCount}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRestore(item.id, item.title)}
                      disabled={isPending}
                      aria-label={`${item.title} を復元`}
                    >
                      <IconRestore className="h-4 w-4" />
                      <span className="ml-1 hidden sm:inline">復元</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleHardDelete(item.id, item.title)}
                      disabled={isPending}
                      className="text-destructive hover:text-destructive"
                      aria-label={`${item.title} を完全に削除`}
                    >
                      <IconTrash className="h-4 w-4" />
                      <span className="ml-1 hidden sm:inline">完全削除</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
