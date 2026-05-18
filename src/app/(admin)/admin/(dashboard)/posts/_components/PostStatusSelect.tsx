"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import {
  publishPost,
  unpublishPost,
  archivePost,
} from "@/admin/actions/post/mutations";
import { isMutationError } from "@/shared/lib/mutation-result";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidPostStatus } from "@/shared/lib/validations/enums/guards";
import { POST_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";

type PostStatusSelectProps = {
  postId: string;
  currentStatus: PostStatus;
};

/**
 * 投稿管理一覧の inline 3-state ステータス Select。
 *
 * 業界標準パターン:
 * - WordPress Quick Edit / Notion Status / Linear Status と同型
 * - 3 状態（DRAFT / PUBLISHED / ARCHIVED）の inline 切替
 * - PublishSwitch (binary) では表現不可な多状態 status の canonical
 *
 * 既存 action 経路:
 * - PUBLISHED への遷移: `publishPost` (PostVersion 作成 + publishedAt 設定)
 * - DRAFT への遷移: `unpublishPost`
 * - ARCHIVED への遷移: `archivePost`
 *
 * 同型実装: `ReservationStatusSelect` (5 状態 + terminal confirmation)。
 */
export function PostStatusSelect({
  postId,
  currentStatus,
}: PostStatusSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const performStatusChange = (newStatus: PostStatus) => {
    startTransition(async () => {
      const result =
        newStatus === PostStatus.PUBLISHED
          ? await publishPost(postId)
          : newStatus === PostStatus.DRAFT
            ? await unpublishPost(postId)
            : await archivePost(postId);

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `ステータスを「${POST_STATUS_LABELS[newStatus]}」に変更しました`,
      );
      router.refresh();
    });
  };

  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => {
        if (!isValidPostStatus(value)) return;
        if (value === currentStatus) return;
        performStatusChange(value);
      }}
      disabled={isPending}
    >
      <SelectTrigger
        className="w-28"
        aria-label={`ステータス（現在: ${POST_STATUS_LABELS[currentStatus]}）`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PostStatus.DRAFT}>
          {POST_STATUS_LABELS.DRAFT}
        </SelectItem>
        <SelectItem value={PostStatus.PUBLISHED}>
          {POST_STATUS_LABELS.PUBLISHED}
        </SelectItem>
        <SelectItem value={PostStatus.ARCHIVED}>
          {POST_STATUS_LABELS.ARCHIVED}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
