"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
} from "@/admin/components/ui";
import { RegistrationStatusBadge } from "@/admin/components/status-badges";
import { useConfirm } from "@/admin/contexts/confirm-context";
import {
  adminPromoteWaitlistEntryAction,
  adminExpireWaitlistOfferAction,
} from "@/admin/actions/event-waitlist";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import type { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

type WaitlistEntry = {
  id: string;
  name: string;
  email: string | null;
  quantity: number;
  slotStartAt: string;
  ticketName: string;
  // 実行時は WAITLISTED / WAITLISTED_OFFERED のみ（`getWaitlistQueue` の
  // WAITLIST_ACTIVE_STATUSES フィルタ由来）だが、literal union への cast は避け
  // waitlist-queries.ts の型決定をそのまま踏襲する。
  status: RegistrationStatus;
  waitlistedAt: string | null;
  offeredAt: string | null;
  expiresAt: string | null;
};

interface WaitlistQueueTableProps {
  readonly entries: WaitlistEntry[];
}

export function WaitlistQueueTable({ entries }: WaitlistQueueTableProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  function handlePromote(registrationId: string) {
    startTransition(async () => {
      const result = await adminPromoteWaitlistEntryAction(registrationId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.alreadyOffered
          ? "既に繰り上げ当選済みでした"
          : "繰り上げ当選メールを送信しました",
      );
      router.refresh();
    });
  }

  async function handleExpire(registrationId: string) {
    const confirmed = await confirm({
      title: "繰り上げ当選を期限切れにしますか？",
      description:
        "この操作は元に戻せません。対象者には期限切れ通知メールが送信されます。",
      confirmLabel: "期限切れにする",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await adminExpireWaitlistOfferAction(registrationId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.expired
          ? "期限切れにしました"
          : "既に処理済みでした（対象は繰り上げ当選中ではありません）",
      );
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        現在キャンセル待ちの登録はありません
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名前</TableHead>
              <TableHead className="hidden md:table-cell">メール</TableHead>
              <TableHead>参加人数</TableHead>
              <TableHead className="hidden lg:table-cell">参加枠</TableHead>
              <TableHead className="hidden lg:table-cell">チケット</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>登録 / 当選日時</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.name}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {entry.email ?? "-"}
                </TableCell>
                <TableCell>{entry.quantity}名</TableCell>
                <TableCell className="hidden lg:table-cell whitespace-nowrap">
                  {formatDateTimeShort(entry.slotStartAt)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {entry.ticketName}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <RegistrationStatusBadge status={entry.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {entry.status === "WAITLISTED_OFFERED" ? (
                    <div className="flex flex-col gap-0.5">
                      <span>当選: {formatDateTimeShort(entry.offeredAt)}</span>
                      <span className="text-muted-foreground">
                        期限: {formatDateTimeShort(entry.expiresAt)} まで
                      </span>
                    </div>
                  ) : (
                    <span>{formatDateTimeShort(entry.waitlistedAt)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {entry.status === "WAITLISTED" && (
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() => handlePromote(entry.id)}
                    >
                      今すぐ繰り上げ
                    </Button>
                  )}
                  {entry.status === "WAITLISTED_OFFERED" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleExpire(entry.id)}
                    >
                      期限切れにする
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
