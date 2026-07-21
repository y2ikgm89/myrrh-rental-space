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
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import {
  bulkUpdatePagePublished,
  bulkDeletePages,
} from "@/admin/actions/pages";
import { isMutationError } from "@/shared/lib/mutation-result";

interface BulkActionsProps {
  selectedSlugs: string[];
  onClear: () => void;
}

export function BulkActions({ selectedSlugs, onClear }: BulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleBulkPublish = (publish: boolean) => {
    startTransition(async () => {
      const result = await bulkUpdatePagePublished(selectedSlugs, publish);
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
    <FloatingBulkActionBar
      selectedCount={selectedSlugs.length}
      onClear={onClear}
      isPending={isPending}
    >
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
        variant="destructive"
        size="sm"
        onClick={handleBulkDelete}
        disabled={isPending}
      >
        {isPending ? (
          <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
        ) : (
          <IconTrash className="h-4 w-4 mr-1" />
        )}
        一括削除
      </Button>
    </FloatingBulkActionBar>
  );
}
