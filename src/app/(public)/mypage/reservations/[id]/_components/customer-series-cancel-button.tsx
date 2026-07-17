"use client";

/**
 * 顧客マイページの「定期予約すべてキャンセル」ボタン (Phase B.2.1 Task 4)。
 *
 * `cancelReservationSeriesCustomerAction` を Dialog + Textarea + Turnstile で
 * wrap する。既存の単発予約キャンセル (`cancel-button.tsx`) と同型 pattern。
 *
 * Settings gate (`customerCanCancelSeriesInFull`) の check は server action 側で
 * fail-closed するが、button の露出 gate は呼出側 (customer-series-info.tsx) が担う。
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/public/components/design-system/dialog";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { cancelReservationSeriesCustomerAction } from "../../../_shared/actions/reservation-series";

interface Props {
  readonly seriesId: string;
  readonly turnstileSiteKey: string | null;
}

export function CustomerSeriesCancelButton({
  seriesId,
  turnstileSiteKey,
}: Props) {
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
      const result = await cancelReservationSeriesCustomerAction(
        seriesId,
        reason || null,
        turnstileToken || undefined,
      );
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
        setTurnstileToken("");
        return;
      }
      setOpen(false);
      router.push("/mypage?cancelled=series");
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
        定期予約すべてキャンセル
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>定期予約すべてキャンセル</DialogTitle>
            <DialogDescription>
              この定期予約のすべての回をまとめてキャンセルします。この操作は取り消せません。
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
            action={TURNSTILE_ACTIONS.mypage_reservation_series_cancel}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken("")}
          />

          {error != null && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              キャンセルしない
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? "キャンセル中..." : "定期予約すべてをキャンセル"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
