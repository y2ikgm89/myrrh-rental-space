"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { getFormProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
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
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // Render 中 state sync: 成功検出 (default `resetForm: true` → initialValue === null)
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setSubmitted(true);
    }
  }

  // Turnstile トークンは 1 回限り有効なので、送信結果を受けたら widget を張り直す。
  // **conform のフィールドには触れない** — トークン欄は widget が所有しており
  // (`TURNSTILE_TOKEN_FIELD_NAME` の hidden input)、ここで conform 経由の
  // change() を呼ぶと再バリデーションが走り、サーバーが返した form-level エラーを
  // client 検証結果で上書きして消してしまう（詳細は turnstile-widget.tsx）。
  //
  // 同じ lastResult に対して 1 回だけ実行する。conform の `useInputControl` を
  // 依存に持っていた頃の無限ループ (PR #1758) の再発防止も兼ねる。処理済みの
  // 結果は ref で覚える（state だと effect 内 setState になり
  // react-hooks/set-state-in-effect に触れる）。
  const turnstileResetForResultRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (lastResult?.status !== "error") return;
    if (turnstileResetForResultRef.current === lastResult) return;
    turnstileResetForResultRef.current = lastResult;
    turnstileRef.current?.reset();
  }, [lastResult]);

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
