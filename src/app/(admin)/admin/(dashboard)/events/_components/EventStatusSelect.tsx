"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { archiveEvent, cancelEvent, publishEvent } from "@/admin/actions/event";
import { isMutationError } from "@/shared/lib/mutation-result";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidEventStatus } from "@/shared/lib/validations/enums/guards";
import {
  EVENT_STATUS_LABELS,
  EVENT_STATUS_TRANSITIONS,
} from "@/shared/lib/validations/enums/helpers";

type EventStatusSelectProps = {
  eventId: string;
  currentStatus: EventStatus;
};

/**
 * イベント管理一覧の inline 4-state ステータス Select。
 *
 * 業界標準パターン:
 * - WordPress Quick Edit / Notion Status / Linear / Sanity Studio と同型
 * - 4 状態（DRAFT / PUBLISHED / CANCELLED / ARCHIVED）の inline 切替
 * - `ReservationStatusSelect` (5 状態) と同型、`PostStatusSelect` (3 状態) の上位版
 *
 * State machine（`EVENT_STATUS_TRANSITIONS` 準拠）:
 * - DRAFT → PUBLISHED / CANCELLED / ARCHIVED
 * - PUBLISHED → CANCELLED / ARCHIVED
 * - CANCELLED → ARCHIVED
 * - ARCHIVED → (terminal, disabled)
 *
 * Terminal 遷移（CANCELLED / ARCHIVED）は AlertDialog で確認 — 復元は
 * 通常の管理者では困難なため誤操作防止（`ReservationStatusSelect` と同型）。
 */
const TERMINAL_STATUS_SET = new Set<EventStatus>([
  EventStatus.CANCELLED,
  EventStatus.ARCHIVED,
]);

function isTerminalTransition(target: EventStatus): boolean {
  return TERMINAL_STATUS_SET.has(target);
}

export function EventStatusSelect({
  eventId,
  currentStatus,
}: EventStatusSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingTerminal, setPendingTerminal] = useState<EventStatus | null>(
    null,
  );

  const isTerminal = currentStatus === EventStatus.ARCHIVED;
  const allowedNextStatuses = EVENT_STATUS_TRANSITIONS[currentStatus] ?? [];

  const performStatusChange = (newStatus: EventStatus) => {
    startTransition(async () => {
      const result =
        newStatus === EventStatus.PUBLISHED
          ? await publishEvent(eventId)
          : newStatus === EventStatus.CANCELLED
            ? await cancelEvent(eventId)
            : await archiveEvent(eventId);

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `ステータスを「${EVENT_STATUS_LABELS[newStatus]}」に変更しました`,
      );
      router.refresh();
    });
  };

  const handleStatusChange = (newStatus: EventStatus) => {
    if (newStatus === currentStatus) return;
    if (isTerminalTransition(newStatus)) {
      setPendingTerminal(newStatus);
      return;
    }
    performStatusChange(newStatus);
  };

  const handleConfirmTerminal = () => {
    if (!pendingTerminal) return;
    const target = pendingTerminal;
    setPendingTerminal(null);
    performStatusChange(target);
  };

  return (
    <>
      <Select
        value={currentStatus}
        onValueChange={(value) => {
          if (!isValidEventStatus(value)) return;
          handleStatusChange(value);
        }}
        disabled={isPending || isTerminal}
      >
        <SelectTrigger
          className="w-28"
          aria-label={`ステータス（現在: ${EVENT_STATUS_LABELS[currentStatus]}）`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={currentStatus}>
            {EVENT_STATUS_LABELS[currentStatus]}
          </SelectItem>
          {allowedNextStatuses.map((status) => (
            <SelectItem key={status} value={status}>
              {EVENT_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog
        open={pendingTerminal !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTerminal(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ステータスを「
              {pendingTerminal ? EVENT_STATUS_LABELS[pendingTerminal] : ""}
              」に変更しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTerminal === EventStatus.CANCELLED
                ? "キャンセル後は ARCHIVED への遷移のみ可能になり、参加者へキャンセル通知メールが送信されます。"
                : "アーカイブは終端状態のため、通常の管理者では元に戻せません。公開ページとカレンダーから除外されます。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmTerminal}
              disabled={isPending}
            >
              {isPending ? "変更中..." : "変更する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
