"use client";

/**
 * ページ一括操作バー
 *
 * テーブル選択時にフローティング表示
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconEye,
  IconEyeOff,
  IconTrash,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { bulkTogglePagePublished, bulkDeletePages } from "@/admin/actions/page";
import { isMutationError } from "@/shared/lib/mutation-result";

interface BulkActionsProps {
  selectedSlugs: string[];
  onClear: () => void;
}

export function BulkActions({ selectedSlugs, onClear }: BulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (selectedSlugs.length === 0) return null;

  const handleBulkPublish = (publish: boolean) => {
    startTransition(async () => {
      const result = await bulkTogglePagePublished(selectedSlugs, publish);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? `${result.count}件のページを公開しました`
          : `${result.count}件のページを非公開にしました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeletePages(selectedSlugs);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`${result.deletedCount}件のページを削除しました`);
      onClear();
      router.refresh();
    });
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <span
          className="text-sm font-medium"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectedSlugs.length}件選択中
        </span>

        <div className="h-4 w-px bg-border" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkPublish(true)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <IconEye className="h-4 w-4 mr-1" />
          )}
          一括公開
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkPublish(false)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <IconEyeOff className="h-4 w-4 mr-1" />
          )}
          一括非公開
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleBulkDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <IconTrash className="h-4 w-4 mr-1" />
          )}
          一括削除
        </Button>

        <div className="h-4 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isPending}
        >
          <IconX className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
