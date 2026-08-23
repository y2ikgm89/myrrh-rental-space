"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { isValidCustomerType } from "@/shared/lib/validations/enums/guards";
import { updateProfileAction } from "../../_shared/actions/profile";
import type { z } from "zod";
import { customerProfileSchema } from "@/shared/lib/validations/customer-profile";
import {
  HiddenControlInput,
  useFieldControl,
} from "@/shared/lib/conform/control";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { CustomerTypeToggle } from "@/public/components/ui/customer-type-toggle";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  readonly defaultValues: {
    readonly customerType: CustomerType;
    readonly lastName: string;
    readonly firstName: string;
    readonly companyName: string;
    readonly email: string;
    readonly phoneNumber: string;
    readonly marketingOptIn: boolean;
  };
  readonly turnstileSiteKey: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileForm({
  defaultValues,
  turnstileSiteKey,
}: ProfileFormProps): ReactElement {
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [lastResult, formAction, isPending] = useActionState(
    updateProfileAction,
    undefined,
  );

  const [form, fields] = useForm<z.input<typeof customerProfileSchema>>({
    id: "profile-form",
    lastResult,
    constraint: getZodConstraint(customerProfileSchema),
    defaultValue: {
      customerType: defaultValues.customerType,
      lastName: defaultValues.lastName,
      firstName: defaultValues.firstName,
      companyName: defaultValues.companyName,
      phoneNumber: defaultValues.phoneNumber,
      marketingOptIn: defaultValues.marketingOptIn ? "on" : undefined,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: customerProfileSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const customerTypeControl = useFieldControl(fields.customerType);

  const customerTypeValue = customerTypeControl.value;
  const customerType: CustomerType = isValidCustomerType(customerTypeValue)
    ? customerTypeValue
    : defaultValues.customerType;

  // Turnstile トークンは 1 回限り有効なので、送信結果を受けたら widget を張り直す。
  // **conform のフィールドには触れない** — トークン欄は widget が所有しており
  // (`TURNSTILE_TOKEN_FIELD_NAME` の hidden input)、ここで conform 経由の
  // change() を呼ぶと再バリデーションが走り、サーバーが返した form-level エラーを
  // client 検証結果で上書きして消してしまう（詳細は turnstile-widget.tsx）。
  //
  // 同じ lastResult に対して 1 回だけ実行する。conform の control hook を
  // 依存に持っていた頃の無限ループ (PR #1758) の再発防止も兼ねる。処理済みの
  // 結果は ref で覚える（state だと effect 内 setState になり
  // react-hooks/set-state-in-effect に触れる）。
  const turnstileResetForResultRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (lastResult === undefined) return;
    if (turnstileResetForResultRef.current === lastResult) return;
    turnstileResetForResultRef.current = lastResult;
    turnstileRef.current?.reset();
  }, [lastResult]);

  function handleCustomerTypeChange(type: CustomerType) {
    customerTypeControl.change(type);
  }

  // success 検出: executeConformMutation の `resetForm: false` 指定で
  // `submission.reply()` は `{ status: "success", initialValue, ... }` を返す
  // (conform v1.19 submission.mjs:144、`reply({ resetForm: true })` の
  // `{ initialValue: null }` とは区別される)
  const showSuccess = lastResult?.status === "success";
  // conform-action の successMessage は SubmissionResult に spread される拡張
  // フィールド。公式型と両立するのは in + typeof だけ（admin の
  // RecurringReservationForm / SeriesInfoSection と同型）。
  const successMessage =
    lastResult !== undefined &&
    "successMessage" in lastResult &&
    typeof lastResult.successMessage === "string"
      ? lastResult.successMessage
      : "プロフィールを更新しました";
  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;

  return (
    <form
      {...getFormProps(form)}
      action={formAction}
      aria-busy={isPending}
      className="space-y-6"
    >
      <HiddenControlInput
        field={fields.customerType}
        control={customerTypeControl}
      />

      {formErrorMessage !== null && (
        <div
          id={form.errorId}
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {formErrorMessage}
        </div>
      )}

      {showSuccess && (
        <div
          className="border border-accent/30 bg-accent/5 p-4 text-sm text-foreground"
          role="status"
        >
          {successMessage}
        </div>
      )}

      <CustomerTypeToggle
        value={customerType}
        onChange={handleCustomerTypeChange}
      />

      {customerType === CustomerType.CORPORATE && (
        <Input
          label="会社名・団体名"
          required
          autoComplete="organization"
          {...(fields.companyName.errors?.[0] !== undefined && {
            error: fields.companyName.errors[0],
          })}
          {...getInputProps(fields.companyName, { type: "text" })}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="姓"
          required
          autoComplete="family-name"
          {...(fields.lastName.errors?.[0] !== undefined && {
            error: fields.lastName.errors[0],
          })}
          {...getInputProps(fields.lastName, { type: "text" })}
        />
        <Input
          label="名"
          required
          autoComplete="given-name"
          {...(fields.firstName.errors?.[0] !== undefined && {
            error: fields.firstName.errors[0],
          })}
          {...getInputProps(fields.firstName, { type: "text" })}
        />
      </div>

      {/* メールアドレス。既に登録済みなら readonly 表示、未登録なら (LINE OAuth で
          email scope 未付与のケース) 入力欄を出して初回登録できるようにする (PR#15)。
          変更 (既登録の書換) は Better Auth の verification 経由が canonical で別 PR。 */}
      <div className="space-y-1">
        {defaultValues.email === "" || defaultValues.email === null ? (
          <>
            <Input
              label="メールアドレス"
              required
              autoComplete="email"
              placeholder="mail@example.com"
              leadingIcon="IconMail"
              aria-describedby="profile-email-help"
              {...(fields.email.errors?.[0] !== undefined && {
                error: fields.email.errors[0],
              })}
              {...getInputProps(fields.email, { type: "email" })}
            />
            <p
              id="profile-email-help"
              className="text-xs text-muted-foreground"
            >
              LINE
              アカウントからメールアドレスが取得できませんでした。予約確定メール等の
              受信のため、ご登録をお願いいたします。
            </p>
          </>
        ) : (
          <>
            <Input
              label="メールアドレス"
              type="email"
              value={defaultValues.email}
              disabled
              autoComplete="email"
              leadingIcon="IconMail"
              aria-describedby="profile-email-help"
            />
            <p
              id="profile-email-help"
              className="text-xs text-muted-foreground"
            >
              メールアドレスはソーシャルアカウントから取得されます
            </p>
          </>
        )}
      </div>

      <Input
        label="電話番号（任意）"
        autoComplete="tel"
        inputMode="tel"
        leadingIcon="IconPhone"
        {...(fields.phoneNumber.errors?.[0] !== undefined && {
          error: fields.phoneNumber.errors[0],
        })}
        {...getInputProps(fields.phoneNumber, { type: "tel" })}
      />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name={fields.marketingOptIn.name}
          value="on"
          defaultChecked={defaultValues.marketingOptIn}
          className="mt-1 size-4 accent-primary"
        />
        <span className="space-y-1">
          <span className="block font-medium text-foreground">
            お知らせメールを受け取る
          </span>
          <span className="block text-xs text-muted-foreground">
            運営からのキャンペーン・お知らせメールの配信を許可します。予約確認などの重要なお知らせは、オフでも届く場合があります。
          </span>
        </span>
      </label>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.mypage_profile}
      />

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
