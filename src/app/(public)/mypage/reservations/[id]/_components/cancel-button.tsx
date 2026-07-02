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
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
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
      router.push("/mypage?cancelled=ok");
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
            action={TURNSTILE_ACTIONS.mypage_reservation_cancel}
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

          {/* JSX 順 = visual 順 (Dialog primitive が flex-col / sm:flex-row 両軸対応)。
           *  mobile 縦並びでは「閉じる」が上、「キャンセル確定」(destructive) が thumb-zone 底に来る。 */}
          <DialogFooter role="group" aria-label="予約キャンセル操作">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              閉じる
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={isPending}
              className="w-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 sm:w-auto"
            >
              {isPending ? "キャンセル中..." : "キャンセルを確定する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
