"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import type { z } from "zod";
import { publicEventWaitlistConfirmSchema } from "@/shared/lib/validations/event-registration";
import { confirmWaitlistOfferAction } from "../_actions/confirm";

interface WaitlistConfirmFormProps {
  readonly token: string;
  readonly turnstileSiteKey: string | null;
  readonly expiresAtLabel: string | null;
}

/**
 * 繰り上げ当選の確定フォーム（無料チケット向け、client component）。
 *
 * token はページ側 (searchParams) から渡され、hidden input で FormData に
 * 載せて送信する（`publicEventWaitlistConfirmSchema` が token を form field
 * として要求する設計。events/cancel の HttpOnly cookie 読み出しとは異なる導線）。
 */
export function WaitlistConfirmForm({
  token,
  turnstileSiteKey,
  expiresAtLabel,
}: WaitlistConfirmFormProps): ReactElement {
  const [submitted, setSubmitted] = useState(false);
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [lastResult, formAction, isPending] = useActionState(
    confirmWaitlistOfferAction,
    undefined,
  );

  const [form, fields] = useForm<
    z.input<typeof publicEventWaitlistConfirmSchema>
  >({
    id: "waitlist-confirm-form",
    lastResult,
    constraint: getZodConstraint(publicEventWaitlistConfirmSchema),
    defaultValue: { token },
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: publicEventWaitlistConfirmSchema,
      });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const turnstileTokenControl = useInputControl(fields.turnstileToken);

  // Render 中 state sync: 成功検出 (default `resetForm: true` → initialValue === null)
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setSubmitted(true);
    }
  }

  // Turnstile DOM reset は副作用のため effect に残置
  useEffect(() => {
    if (lastResult?.status === "error") {
      turnstileRef.current?.reset();
      turnstileTokenControl.change("");
    }
  }, [lastResult, turnstileTokenControl]);

  function handleTurnstileVerify(verifiedToken: string) {
    turnstileTokenControl.change(verifiedToken);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
  }

  if (submitted) {
    return (
      <div className="border border-accent/30 bg-surface px-8 py-12 text-center">
        <IconCircleCheck
          className="mx-auto h-10 w-10 text-accent"
          aria-hidden
        />
        <Heading level={3} className="mt-4">
          参加が確定しました
        </Heading>
        <p className="mt-3 text-muted-foreground">
          確認メールをお送りしましたのでご確認ください。
        </p>
        <p className="mt-4 text-sm">
          <Link
            href="/mypage"
            className="underline underline-offset-4 hover:text-foreground"
          >
            マイページで確認する
          </Link>
        </p>
      </div>
    );
  }

  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;

  return (
    <form
      {...getFormProps(form)}
      action={formAction}
      className="space-y-6 border border-border p-6 sm:p-8"
    >
      <input type="hidden" name={fields.token.name} value={token} />
      <input
        type="hidden"
        name={fields.turnstileToken.name}
        value={turnstileTokenControl.value ?? ""}
      />

      <div className="border border-info/30 bg-info/5 p-4 text-sm" role="note">
        <p className="font-medium text-foreground">参加確定について</p>
        <p className="mt-1 text-muted-foreground">
          「参加を確定する」を押すとキャンセル待ちの繰り上げ当選が確定します。
          {expiresAtLabel
            ? ` ${expiresAtLabel} を過ぎると自動的に無効になります。`
            : null}
        </p>
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.event_waitlist_confirm}
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />

      {formErrorMessage !== null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {formErrorMessage}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "送信中..." : "参加を確定する"}
      </Button>
    </form>
  );
}
