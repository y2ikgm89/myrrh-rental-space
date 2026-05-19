"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";
import { duplicateEvent } from "@/admin/actions/event";
import { isMutationError } from "@/shared/lib/mutation-result";

type EventActionCellProps = {
  eventId: string;
};

/**
 * イベント管理一覧の ActionDropdown。
 *
 * ステータス変更（公開 / キャンセル / アーカイブ）は同行の `EventStatusSelect`
 * で inline 変更するため、本 cell からは publish / cancel menu を削除済み
 * （業界標準: WordPress / Notion / Linear ステータス inline 切替パターン）。
 */
export function EventActionCell({ eventId }: EventActionCellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDuplicate = () => {
    startTransition(async () => {
      const result = await duplicateEvent(eventId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("イベントを複製しました");
      router.push(`/admin/events/${result.id}/edit`);
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/events/${eventId}`}>
        詳細
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/events/${eventId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem onClick={handleDuplicate}>複製</ActionDropdownItem>
    </ActionDropdown>
  );
}
