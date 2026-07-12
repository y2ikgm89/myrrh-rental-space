"use client";

import { useState, useTransition, type ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { isMutationError } from "@/shared/lib/mutation-result";
import { startCheckoutSessionAction } from "../../../_shared/actions/reservation";

interface CheckoutButtonProps {
  readonly reservationId: string;
}

/**
 * 公開マイページの予約詳細から Stripe Checkout Session を開始するボタン (PR#7)。
 *
 * paymentStatus=UNPAID かつ totalPrice>0 の予約でのみ表示される (親 Server Component
 * が条件分岐)。クリック → `startCheckoutSessionAction` (server action) → Stripe
 * Session URL 取得 → `window.location.href` で外部リダイレクト (Stripe host)。
 */
export function CheckoutButton({
  reservationId,
}: CheckoutButtonProps): ReactElement {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick(): void {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await startCheckoutSessionAction(reservationId);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
        return;
      }
      if (result.sessionUrl) {
        window.location.href = result.sessionUrl;
      } else {
        setErrorMessage("決済セッションの URL が取得できませんでした");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full sm:w-auto"
      >
        {isPending ? "決済ページへ移動中..." : "オンラインで決済する"}
      </Button>
      {errorMessage !== null && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
