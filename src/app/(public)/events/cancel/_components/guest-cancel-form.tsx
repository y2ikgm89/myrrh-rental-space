"use client";

import { useState, useRef, useTransition } from "react";
import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { cancelGuestEventRegistrationAction } from "../_actions/cancel";

interface GuestCancelFormProps {
  readonly turnstileSiteKey: string | null;
}

/**
 * トークンはサーバ側で HttpOnly cookie (`event-cancel-token`) から読まれる。
 * client から token を引き渡す必要はない（漏洩面遮断のため意図的に prop 廃止）。
 */
export function GuestCancelForm({ turnstileSiteKey }: GuestCancelFormProps) {
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileInstance>(null);

  if (done) {
    return (
      <div className="border border-success/30 bg-success/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          申込をキャンセルしました
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          またのご参加をお待ちしております。
        </p>
      </div>
    );
  }

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelGuestEventRegistrationAction(
        turnstileToken || undefined,
      );
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
        return;
      }
      setDone(true);
    });
  };

  return (
    <Stack gap="md">
      <div
        className="border border-warning/30 bg-warning/5 p-4 text-sm"
        role="note"
      >
        <p className="font-medium text-foreground">この操作は取り消せません</p>
        <p className="mt-1 text-muted-foreground">
          「キャンセルを確定する」を押すと参加申込がキャンセルされます。
        </p>
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.guest_event_registration_cancel}
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

      <Button
        variant="primary"
        size="sm"
        onClick={handleConfirm}
        disabled={isPending}
        className="self-start bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
      >
        {isPending ? "キャンセル中..." : "キャンセルを確定する"}
      </Button>
    </Stack>
  );
}
