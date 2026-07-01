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
} from "@/admin/components/ui/alert-dialog";
import { Button } from "@/admin/components/ui/button";
import { isMutationError } from "@/shared/lib/mutation-result";

type Props = {
  userId: string;
  staffName: string;
  staffEmail: string;
};

type StaffAccessGuideDialogProps = Props & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StaffAccessGuideDialog({
  userId,
  staffName,
  staffEmail,
  open,
  onOpenChange,
}: StaffAccessGuideDialogProps) {
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
      onOpenChange(false);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
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

export function StaffAccessGuideButton(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <IconMail className="h-4 w-4" />
        案内メール
      </Button>
      <StaffAccessGuideDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
