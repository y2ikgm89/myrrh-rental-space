"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/public/components/design-system/dialog";
import { cancelReservationAction } from "../../../_shared/actions/reservation";

interface CancelButtonProps {
  readonly reservationId: string;
}

export function CancelButton({ reservationId }: CancelButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelReservationAction(reservationId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push("/mypage");
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        予約をキャンセルする
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>予約のキャンセル確認</DialogTitle>
            <DialogDescription>
              この予約をキャンセルしてもよろしいですか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>

          {error != null && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="mt-2 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              閉じる
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "キャンセル中..." : "キャンセルを確定する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
