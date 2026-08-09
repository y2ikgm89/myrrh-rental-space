"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconUserCheck,
  IconUserOff,
  IconLoader2,
  IconChevronDown,
  IconMail,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/admin/components/ui";
import { AnonymizeCustomerConfirmDialog } from "@/admin/components/AnonymizeCustomerConfirmDialog";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import {
  bulkToggleActiveCustomers,
  bulkAnonymizeCustomers,
  bulkSetStatusCustomers,
  broadcastCustomersAction,
} from "@/admin/actions/customer/bulk";
import { CustomerBulkEmailDialog } from "./CustomerBulkEmailDialog";
import { isMutationError } from "@/shared/lib/mutation-result";
import { keysOf } from "@/shared/lib/serialize";
import { CUSTOMER_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import type { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { AnonymizeCustomerReason } from "@/shared/domain/customers/customer-lifecycle-commands";

interface CustomerBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

/**
 * 顧客一括操作バー（テーブル選択時にフローティング表示）。
 *
 * 有効化/無効化・ステータス変更・匿名化・一括メール送信で `useTransition` を
 * **1 つだけ共有する**（操作ごとに分けない）。バー内の全トリガーが
 * `disabled={isPending}` で、`AnonymizeCustomerConfirmDialog` /
 * `CustomerBulkEmailDialog` にも同じ `isPending` を渡すため、実行中に別操作を
 * 開始できず共有でも実害が無い。`ReservationBulkActions.tsx` も単一 useTransition。
 * 分割する場合は、この disabled 伝搬をトリガー単位に置き換えてから行うこと。
 */
export function CustomerBulkActions({
  selectedIds,
  onClear,
}: CustomerBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const handleBulkToggleActive = (isActive: boolean) => {
    startTransition(async () => {
      const result = await bulkToggleActiveCustomers(selectedIds, isActive);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isActive
          ? `${result.count}件の顧客を有効化しました`
          : `${result.count}件の顧客を無効化しました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkSetStatus = (newStatus: CustomerStatus) => {
    startTransition(async () => {
      const result = await bulkSetStatusCustomers(selectedIds, newStatus);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const label = CUSTOMER_STATUS_LABELS[newStatus];
      const baseMessage = `${result.count}件のステータスを「${label}」に変更しました`;
      const message =
        result.rejectedIds.length > 0
          ? `${baseMessage}（${result.rejectedIds.length}件は遷移不可のためスキップ）`
          : baseMessage;
      toast.success(message);
      onClear();
      router.refresh();
    });
  };

  const handleBulkAnonymize = (reason: AnonymizeCustomerReason) => {
    startTransition(async () => {
      const result = await bulkAnonymizeCustomers(selectedIds, reason);
      if (isMutationError(result)) {
        toast.error(result.error);
        setAnonymizeOpen(false);
        return;
      }

      const baseMessage = `${result.count}件の顧客を匿名化しました`;
      const message =
        result.skippedIds.length > 0
          ? `${baseMessage}（${result.skippedIds.length}件は既に匿名化済みのためスキップ）`
          : baseMessage;
      toast.success(message);
      setAnonymizeOpen(false);
      onClear();
      router.refresh();
    });
  };

  const handleConfirmBulkEmail = (options: {
    subject: string;
    body: string;
  }) => {
    startTransition(async () => {
      const result = await broadcastCustomersAction(
        selectedIds,
        options.subject,
        options.body,
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const parts: string[] = [];
      if (result.sent > 0) parts.push(`${result.sent}件送信`);
      if (result.excluded > 0)
        parts.push(`${result.excluded}件除外(配信停止済み)`);
      toast.success(
        parts.length > 0 ? parts.join("、") : "対象者がいませんでした",
      );
      setEmailDialogOpen(false);
      onClear();
    });
  };

  return (
    <>
      <FloatingBulkActionBar
        selectedCount={selectedIds.length}
        onClear={onClear}
        isPending={isPending}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkToggleActive(true)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconUserCheck className="mr-1 h-4 w-4" />
          )}
          一括有効化
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkToggleActive(false)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconUserOff className="mr-1 h-4 w-4" />
          )}
          一括無効化
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              ステータス変更
              <IconChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {keysOf(CUSTOMER_STATUS_LABELS).map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => handleBulkSetStatus(status)}
              >
                {CUSTOMER_STATUS_LABELS[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setEmailDialogOpen(true)}
          disabled={isPending}
        >
          <IconMail className="mr-1 h-4 w-4" />
          一括メール送信
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setAnonymizeOpen(true)}
          disabled={isPending}
        >
          <IconUserOff className="mr-1 h-4 w-4" />
          一括匿名化
        </Button>
      </FloatingBulkActionBar>

      <AnonymizeCustomerConfirmDialog
        open={anonymizeOpen}
        onOpenChange={setAnonymizeOpen}
        title={`${selectedIds.length}件の顧客を匿名化しますか？`}
        description="この操作は取り消せません。予約・領収書・お問い合わせは残りますが、個人情報は削除されます。以降のログインは不可になります。"
        onConfirm={handleBulkAnonymize}
        isPending={isPending}
      />

      <CustomerBulkEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        onConfirm={handleConfirmBulkEmail}
        isPending={isPending}
        targetCount={selectedIds.length}
      />
    </>
  );
}
