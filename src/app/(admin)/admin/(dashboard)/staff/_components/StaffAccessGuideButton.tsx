"use client";

import { useState } from "react";
import { IconMail } from "@tabler/icons-react";
import { toast } from "sonner";
import { resendStaffAccessGuide } from "@/admin/actions/user";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/admin/components/ui/alert-dialog";
import { Button } from "@/admin/components/ui/button";
import { isMutationError } from "@/shared/lib/mutation-result";

type Props = {
  userId: string;
  staffName: string;
  staffEmail: string;
};

export function StaffAccessGuideButton({
  userId,
  staffName,
  staffEmail,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleSend() {
    setIsPending(true);
    try {
      const result = await resendStaffAccessGuide(userId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(result.message);
      setOpen(false);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <IconMail className="h-4 w-4" />
          案内メール
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>案内メールを送信しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            管理画面の共通URLとGoogle/IAPでのログイン案内を送信します。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="font-medium text-foreground">{staffName}</div>
          <div className="break-all text-muted-foreground">{staffEmail}</div>
          <p className="mt-2 text-muted-foreground">
            IAP許可グループへの追加はGoogle Cloud側で別途確認してください。
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            {isPending ? "送信中..." : "送信"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
