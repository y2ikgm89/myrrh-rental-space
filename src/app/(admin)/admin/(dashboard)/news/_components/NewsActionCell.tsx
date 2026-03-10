"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";
import { publishNews, unpublishNews } from "@/admin/actions/news";
import { isMutationError } from "@/shared/lib/mutation-result";

type NewsActionCellProps = {
  newsId: string;
  isPublished: boolean;
};

export function NewsActionCell({ newsId, isPublished }: NewsActionCellProps) {
  const [isPending, startTransition] = useTransition();

  const handlePublish = () => {
    startTransition(async () => {
      const result = await publishNews(newsId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`公開しました（バージョン ${result.version}）`);
    });
  };

  const handleUnpublish = () => {
    startTransition(async () => {
      const result = await unpublishNews(newsId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("下書きに戻しました");
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/news/${newsId}`}>
        編集
      </ActionDropdownItem>
      {isPublished ? (
        <ActionDropdownItem onClick={handleUnpublish}>
          下書きに戻す
        </ActionDropdownItem>
      ) : (
        <ActionDropdownItem onClick={handlePublish}>
          公開する
        </ActionDropdownItem>
      )}
    </ActionDropdown>
  );
}
