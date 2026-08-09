"use client";

import { useActionState, useEffect, useRef, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { getFormProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import type { z } from "zod";
import { Button } from "@/public/components/design-system/button";
import { Textarea } from "@/public/components/design-system/textarea";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { customerInquiryReplySchema } from "@/shared/lib/validations/inquiry";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import { replyToInquiryAction } from "../../../_shared/actions/inquiry";
import type { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";

interface InquiryReplyFormProps {
  readonly inquiryId: string;
  readonly status: InquiryStatus;
  readonly turnstileSiteKey: string | null;
}

export function InquiryReplyForm({
  inquiryId,
  status,
  turnstileSiteKey,
}: InquiryReplyFormProps): ReactElement | null {
  if (status === "CLOSED") {
    return (
      <section className="mt-10 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          このお問い合わせは終了しているため、返信できません。
        </p>
      </section>
    );
  }

  if (status === "SPAM") {
    return (
      <section className="mt-10 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          このお問い合わせには返信できません。
        </p>
      </section>
    );
  }

  return (
    <InquiryReplyFormInner
      inquiryId={inquiryId}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}

function InquiryReplyFormInner({
  inquiryId,
  turnstileSiteKey,
}: Omit<InquiryReplyFormProps, "status">): ReactElement {
  const router = useRouter();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [lastResult, formAction, isPending] = useActionState(
    replyToInquiryAction,
    undefined,
  );

  const [form, fields] = useForm<z.input<typeof customerInquiryReplySchema>>({
    id: `inquiry-reply-${inquiryId}`,
    lastResult,
    constraint: getZodConstraint(customerInquiryReplySchema),
    defaultValue: { inquiryId },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: customerInquiryReplySchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    // 返信では rate limit 超過・Turnstile 検証失敗・機能 OFF がこの経路で返る。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // 成功時は `resetForm: true` の reply が来るので `initialValue === null`。
  // スレッドに自分の返信を出すためサーバー側を読み直す。
  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      router.refresh();
    }
  }, [lastResult, router]);

  // Turnstile token は一度の検証で消費されるので、**成功・失敗を問わず**応答を
  // 受けたら widget を張り直す。このフォームは送信後も画面に residing したまま
  // （完了画面に切り替わらず `router.refresh()` でスレッドだけ更新する）なので、
  // 成功時に張り直さないと 2 通目が消費済み token を送り、本来通るはずの返信が
  // Turnstile 検証失敗になる。**conform のフィールドには触れない** — トークン欄は
  // widget が `response-field-name` で所有しており、書き戻すと再バリデーションが
  // サーバーの form-level エラーを上書きして消す
  // （詳細は turnstile-widget.tsx）。
  const turnstileResetForResultRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (!lastResult) return;
    if (turnstileResetForResultRef.current === lastResult) return;
    turnstileResetForResultRef.current = lastResult;
    turnstileRef.current?.reset();
  }, [lastResult]);

  const formErrors = form.errors;

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-base font-medium text-foreground">返信を送る</h2>
      <form {...getFormProps(form)} action={formAction} className="space-y-4">
        <input type="hidden" name={fields.inquiryId.name} value={inquiryId} />

        <Textarea
          key={fields.body.key}
          id={fields.body.id}
          name={fields.body.name}
          defaultValue={fields.body.initialValue}
          label="返信内容"
          rows={5}
          placeholder="追加のご質問やご連絡内容を入力してください"
          maxLength={5000}
          disabled={isPending}
          required
          {...(fields.body.errors
            ? { error: fields.body.errors.join(", ") }
            : {})}
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.mypage_inquiry_reply}
        />

        {formErrors && formErrors.length > 0 && (
          <div
            id={form.errorId}
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {formErrors.join(", ")}
          </div>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? "送信中..." : "返信を送信する"}
        </Button>
      </form>
    </section>
  );
}
