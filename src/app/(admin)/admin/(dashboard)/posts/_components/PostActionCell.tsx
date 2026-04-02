"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { publishPost, unpublishPost } from "@/admin/actions/post/mutations";
import { PostStatus } from "@generated/prisma/enums";
import { isMutationError } from "@/shared/lib/mutation-result";

type PostActionCellProps = {
  postId: string;
  status: PostStatus;
};

export function PostActionCell({ postId, status }: PostActionCellProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const isPublished = optimisticStatus === PostStatus.PUBLISHED;

  const handlePublish = () => {
    startTransition(async () => {
      setOptimisticStatus(PostStatus.PUBLISHED);
      const result = await publishPost(postId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`公開しました（バージョン ${result.version}）`);
    });
  };

  const handleUnpublish = () => {
    startTransition(async () => {
      setOptimisticStatus(PostStatus.DRAFT);
      const result = await unpublishPost(postId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("下書きに戻しました");
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/posts/${postId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownSeparator />
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
