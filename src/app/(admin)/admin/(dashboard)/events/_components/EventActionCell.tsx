"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { publishEvent, cancelEvent } from "@/admin/actions/event";
import { EventStatus } from "@/shared/db/enums";
import { isMutationError } from "@/shared/lib/mutation-result";

type EventActionCellProps = {
  eventId: string;
  status: EventStatus;
};

export function EventActionCell({ eventId, status }: EventActionCellProps) {
  const [isPending, startTransition] = useTransition();

  const handlePublish = () => {
    startTransition(async () => {
      const result = await publishEvent(eventId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("イベントを公開しました");
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelEvent(eventId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("イベントをキャンセルしました");
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
      <ActionDropdownSeparator />
      {status === EventStatus.DRAFT && (
        <ActionDropdownItem onClick={handlePublish}>
          公開する
        </ActionDropdownItem>
      )}
      {(status === EventStatus.DRAFT || status === EventStatus.PUBLISHED) && (
        <ActionDropdownItem destructive onClick={handleCancel}>
          キャンセル
        </ActionDropdownItem>
      )}
    </ActionDropdown>
  );
}
