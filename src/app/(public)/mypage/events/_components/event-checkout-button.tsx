"use client";

import { useState, useTransition, type ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { isMutationError } from "@/shared/lib/mutation-result";
import { startEventCheckoutSessionAction } from "../../_shared/actions/event-registration";

interface EventCheckoutButtonProps {
  readonly registrationId: string;
}

/**
 * 公開マイページのイベント申込から Stripe Checkout Session を開始するボタン。
 *
 * paymentStatus=UNPAID かつ ticketTotalPrice>0 の CONFIRMED 申込でのみ表示
 * (親 Server Component が条件分岐)。
 */
export function EventCheckoutButton({
  registrationId,
}: EventCheckoutButtonProps): ReactElement {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick(): void {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await startEventCheckoutSessionAction(registrationId);
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
