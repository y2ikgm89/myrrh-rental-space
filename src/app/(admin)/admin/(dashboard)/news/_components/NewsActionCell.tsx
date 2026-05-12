"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";
import { updateNewsPublished } from "@/admin/actions/news";
import { isMutationError } from "@/shared/lib/mutation-result";

type NewsActionCellProps = {
  newsId: string;
  isPublished: boolean;
};

export function NewsActionCell({ newsId, isPublished }: NewsActionCellProps) {
  const [isPending, startTransition] = useTransition();

  const handleTogglePublish = () => {
    startTransition(async () => {
      const result = await updateNewsPublished(newsId, !isPublished);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(result.isPublished ? "公開しました" : "下書きに戻しました");
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/news/${newsId}`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem onClick={handleTogglePublish}>
        {isPublished ? "下書きに戻す" : "公開する"}
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
