"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconUserOff } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui/button";
import { anonymizeCustomer } from "@/admin/actions/customer";
import { AnonymizeCustomerConfirmDialog } from "@/admin/components/AnonymizeCustomerConfirmDialog";
import type { AnonymizeCustomerReason } from "@/shared/domain/customers/commands";
import { isMutationError } from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/typed-routes";

type Props = {
  customerId: string;
  displayName: string;
  redirectTo: string;
};

/**
 * STATE-03: 顧客詳細画面の匿名化ボタン。
 *
 * 決済歴のある顧客は物理削除できないため、旧「削除」ボタンは「匿名化」に置換された。
 * dialog で匿名化理由 (customer-requested / admin-purge / data-retention) を必須選択させる。
 */
export function AnonymizeCustomerButton({
  customerId,
  displayName,
  redirectTo,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = (reason: AnonymizeCustomerReason) => {
    startTransition(async () => {
      const result = await anonymizeCustomer(customerId, reason);
      if (isMutationError(result)) {
        setOpen(false);
        toast.error(result.error);
        return;
      }
      toast.success("顧客を匿名化しました");
      router.push(toAppRoute(redirectTo));
    });
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <IconUserOff className="mr-2 h-4 w-4" />
        匿名化
      </Button>
      <AnonymizeCustomerConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`${displayName} を匿名化しますか？`}
        description="この操作は取り消せません。予約・領収書・お問い合わせは残りますが、氏名・メール・電話番号などの個人情報は削除されます。以降のログインは不可になります。"
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </>
  );
}
