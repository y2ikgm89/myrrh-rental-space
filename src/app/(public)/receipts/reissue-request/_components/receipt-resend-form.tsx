"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import type { z } from "zod";

import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Stack } from "@/public/components/design-system/stack";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { receiptResendRequestSchema } from "@/shared/lib/validations/receipt-resend";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

import { requestReceiptResendAction } from "../_actions/resend";

interface Props {
  readonly turnstileSiteKey: string | null;
  readonly initialSerialNo?: string;
}

/**
 * ゲスト向け領収書再送信リクエストフォーム。
 *
 * ## enumeration 対策
 * Server Action は match/mismatch に関わらず常に success を返す。client 側も
 * それを受けて同一の「完了画面」を表示することで、attacker が serialNo / email の
 * 存在を推測できないようにする (Stripe recovery flow と同型)。
 *
 * ## Bot 対策
 *  - honeypot (`website` フィールド): 視覚的に隠した hidden input。bot はそこに入力しがち
 *  - formRenderedAt: マウント時刻を hidden field に埋め、submit までの時間で bot 判定
 *  - Turnstile: Cloudflare の bot 緩和
 */
export function ReceiptResendForm({
  turnstileSiteKey,
  initialSerialNo,
}: Props) {
  const turnstileRef = useRef<TurnstileInstance>(null);
  // 時間トラップの基準時刻。初回レンダーで固定する（`useEffect` で入れると
  // hydration 後の 1 フレーム分だけ未設定になり、その間の submit が素通りする）。
  const [formRenderedAt] = useState(() => Date.now());
  const [lastResult, formAction, isPending] = useActionState(
    requestReceiptResendAction,
    undefined,
  );

  const [form, fields] = useForm<z.input<typeof receiptResendRequestSchema>>({
    id: "receipt-resend-request",
    lastResult,
    constraint: getZodConstraint(receiptResendRequestSchema),
    defaultValue: { serialNo: initialSerialNo ?? "" },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: receiptResendRequestSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    // ここでは IP / email / serialNo の 3 種の rate limit と Turnstile 検証失敗が
    // この経路で返る。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // **完了画面は一度立ったら戻さない。** `lastResult` から毎レンダー導出すると、
  // 後続の revalidate で `lastResult` が入れ替わった瞬間にフォームへ戻ってしまう
  // （PR #1754 で踏んだ「完了画面の派生値が化ける」問題）。render 中 state sync で
  // 一方向に倒す（React 公式: Adjusting State Directly During Render）。
  const [submitted, setSubmitted] = useState(false);
  const [previousResult, setPreviousResult] = useState<unknown>(undefined);
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setSubmitted(true);
    }
  }

  // Turnstile token は 1 回の検証で消費される。serialNo rate-limit エラー等
  // Turnstile 成功後に返る error でも token は消費済みなので、widget を張り直さないと
  // 再送信で消費済み token を送ってしまい、本来のエラーの代わりに Turnstile 検証失敗が
  // 出る (Codex review, PR #1430)。**conform のフィールドには触れない** — トークン欄は
  // widget が `response-field-name` で所有しており、書き戻すと再バリデーションが
  // サーバーの form-level エラーを上書きして消す。
  const turnstileResetForResultRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (lastResult?.status !== "error") return;
    if (turnstileResetForResultRef.current === lastResult) return;
    turnstileResetForResultRef.current = lastResult;
    turnstileRef.current?.reset();
  }, [lastResult]);

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border border-success/30 bg-success/5 p-6"
      >
        <p className="text-base font-medium text-foreground">
          再送信リクエストを受け付けました
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ご入力内容が正しい場合、通常数分以内にご登録メールアドレス宛に領収書ダウンロードリンクをお送りします。
          数分以内に届かない場合は、迷惑メールフォルダをご確認いただくか、{" "}
          <Link
            href={toAppRoute("/contact")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            お問い合わせ
          </Link>{" "}
          よりご連絡ください。
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          再送信リンクの有効期限は発行から 24 時間、1
          回のみダウンロード可能です。
        </p>
      </div>
    );
  }

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction}>
      <Stack gap="md">
        <Input
          {...getInputProps(fields.serialNo, { type: "text" })}
          label="領収書番号"
          placeholder="例: 2026-000042"
          maxLength={20}
          autoComplete="off"
          required
          disabled={isPending}
          {...(fields.serialNo.errors
            ? { error: fields.serialNo.errors.join(", ") }
            : {})}
        />
        <Input
          {...getInputProps(fields.email, { type: "email" })}
          label="ご登録メールアドレス"
          placeholder="example@example.com"
          maxLength={255}
          autoComplete="email"
          required
          disabled={isPending}
          {...(fields.email.errors
            ? { error: fields.email.errors.join(", ") }
            : {})}
        />

        <input
          type="hidden"
          name={fields.formRenderedAt.name}
          value={formRenderedAt}
        />
        {/* Honeypot: 視覚的に隠した hidden input。bot はここに入力してしまう */}
        <input
          type="text"
          name={fields.website.name}
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          className="sr-only"
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.guest_receipt_resend_request}
        />

        {formErrors && formErrors.length > 0 && (
          <div
            id={form.errorId}
            role="alert"
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {formErrors.join(", ")}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={isPending}
          className="self-start"
        >
          {isPending ? "送信中..." : "再送信をリクエスト"}
        </Button>
      </Stack>
    </form>
  );
}
