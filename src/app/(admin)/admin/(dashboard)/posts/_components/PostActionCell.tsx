"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { publishPost, unpublishPost } from "@/admin/actions/post";
import { PostStatus } from "@/shared/db/enums";
import { isMutationError } from "@/shared/lib/mutation-result";

type PostActionCellProps = {
  postId: string;
  status: PostStatus;
};

export function PostActionCell({ postId, status }: PostActionCellProps) {
  const [isPending, startTransition] = useTransition();

  const handlePublish = () => {
    startTransition(async () => {
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
      {status === PostStatus.PUBLISHED ? (
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
