"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconPencil, IconTrash } from "@tabler/icons-react";
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
import { deleteTerms } from "@/admin/actions/terms";
import type { AdminTermsListItem } from "@/shared/domain/terms/admin-queries";

interface TermsTableProps {
  readonly items: AdminTermsListItem[];
}

export function TermsTable({ items }: TermsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string, title: string) {
    if (
      !window.confirm(
        `「${title}」を削除しますか？\n（同意記録は保持されます）`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await deleteTerms(id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("規約を削除しました");
        router.refresh();
      } catch (error) {
        logger.error("規約削除エラー", { error: getErrorMessage(error) });
        toast.error("削除中にエラーが発生しました");
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          まだ規約が登録されていません
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead>タイプ</TableHead>
              <TableHead>スラッグ</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>同意必須</TableHead>
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
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {item.slug}
                </TableCell>
                <TableCell>
                  {item.isPublished ? (
                    <Badge>公開中</Badge>
                  ) : (
                    <Badge variant="outline">下書き</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {item.requiredAtReservation && (
                      <Badge variant="outline" className="text-xs">
                        予約
                      </Badge>
                    )}
                    {item.requiredAtInquiry && (
                      <Badge variant="outline" className="text-xs">
                        問合せ
                      </Badge>
                    )}
                    {item.requiredAtSignup && (
                      <Badge variant="outline" className="text-xs">
                        登録
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.agreementsCount}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/terms/${item.id}/edit`}>
                        <IconPencil className="h-4 w-4" />
                        <span className="sr-only">編集</span>
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(item.id, item.title)}
                      disabled={isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <IconTrash className="h-4 w-4" />
                      <span className="sr-only">削除</span>
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
