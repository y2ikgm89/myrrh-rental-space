"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMailCheck } from "@tabler/icons-react";
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
  Button,
} from "@/admin/components/ui";
import { resetCustomerEmailDelivery } from "@/admin/actions/customer";
import { isMutationError } from "@/shared/lib/mutation-result";
import { EMAIL_DELIVERY_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import type { EmailDeliveryStatus } from "@/shared/lib/validations/enums/prisma-types";

type Props = {
  customerId: string;
  currentStatus: EmailDeliveryStatus;
};

/**
 * RESEND-AUDIT M8: Customer.emailDeliveryStatus を OK にリセットするボタン。
 *
 * 現在の状態が OK 以外 (HARD_BOUNCED / COMPLAINED / SOFT_BOUNCED) の場合のみ
 * 呼び出し側でこのコンポーネントを描画する。DNS 一時障害や誤配信で終端状態が
 * 付いた正規顧客を、配信可 (OK) に戻すための唯一の管理 UI パス。
 */
export function ResetEmailDeliveryButton({ customerId, currentStatus }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await resetCustomerEmailDelivery(customerId);
      if (isMutationError(result)) {
        setOpen(false);
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("配信停止を解除しました");
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="w-full"
      >
        <IconMailCheck className="mr-2 h-4 w-4" />
        配信停止を解除
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>配信停止を解除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              現在の配信状態は「{EMAIL_DELIVERY_STATUS_LABELS[currentStatus]}
              」です。 解除すると以降のメール (予約確認・領収書・リマインダー等)
              が この顧客宛にも通常通り送信されます。 DNS
              一時障害や誤配信で終端状態が付いた場合の復旧用途で使用してください。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {isPending ? "解除中..." : "解除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
