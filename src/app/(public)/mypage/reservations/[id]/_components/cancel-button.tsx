"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/public/components/design-system/dialog";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { cancelReservationAction } from "../../../_shared/actions/reservation";

interface CancelButtonProps {
  readonly reservationId: string;
  readonly turnstileSiteKey: string | null;
}

export function CancelButton({
  reservationId,
  turnstileSiteKey,
}: CancelButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelReservationAction(
        reservationId,
        reason || null,
        turnstileToken || undefined,
      );
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
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
          setReason("");
          setTurnstileToken("");
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

          <Textarea
            label="キャンセル理由（任意）"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="キャンセルの理由をお聞かせください"
            maxLength={500}
            disabled={isPending}
          />

          <TurnstileWidget
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken("")}
          />

          {error != null && (
            <div
              className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
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
              className="bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              {isPending ? "キャンセル中..." : "キャンセルを確定する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
