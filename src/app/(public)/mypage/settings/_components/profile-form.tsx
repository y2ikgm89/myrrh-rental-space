"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ReactElement } from "react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { updateProfileAction } from "../../_shared/actions/profile";
import type { z } from "zod";
import type { customerProfileSchema } from "@/shared/lib/validations/customer-profile";
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
  };
  readonly turnstileSiteKey: string | null;
}

function isCustomerType(value: unknown): value is CustomerType {
  return value === CustomerType.PERSONAL || value === CustomerType.CORPORATE;
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

  // Server-only validation (bundle 削減): `onValidate` / `constraint` を渡さない
  // と Conform は提交時にサーバへ送信し、`lastResult` 経由でフィールドエラーを反映する
  // (公式: validation.md 「Optional: Client validation. Fallback to server validation if not provided」)。
  const [form, fields] = useForm<z.input<typeof customerProfileSchema>>({
    id: "profile-form",
    lastResult,
    defaultValue: {
      customerType: defaultValues.customerType,
      lastName: defaultValues.lastName,
      firstName: defaultValues.firstName,
      companyName: defaultValues.companyName,
      phoneNumber: defaultValues.phoneNumber,
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const customerTypeControl = useInputControl(fields.customerType);
  const turnstileTokenControl = useInputControl(fields.turnstileToken);

  const customerTypeValue = customerTypeControl.value;
  const customerType: CustomerType = isCustomerType(customerTypeValue)
    ? customerTypeValue
    : defaultValues.customerType;

  // success / error 後の Turnstile widget DOM reset (副作用)
  // Turnstile token は一度の検証で消費されるため、結果に関わらず reset
  useEffect(() => {
    if (lastResult !== undefined) {
      turnstileRef.current?.reset();
      turnstileTokenControl.change("");
    }
  }, [lastResult, turnstileTokenControl]);

  function handleCustomerTypeChange(type: CustomerType) {
    customerTypeControl.change(type);
  }

  function handleTurnstileVerify(token: string) {
    turnstileTokenControl.change(token);
  }

  function handleTurnstileExpire() {
    turnstileTokenControl.change("");
  }

  // success 検出: executeConformMutation の `resetForm: false` 指定で
  // `submission.reply()` は `{ status: "success", initialValue, ... }` を返す
  // (conform v1.19 submission.mjs:144、`reply({ resetForm: true })` の
  // `{ initialValue: null }` とは区別される)
  const showSuccess = lastResult?.status === "success";
  const formErrorMessage =
    form.errors !== undefined && form.errors.length > 0 ? form.errors[0] : null;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-6">
      <input
        type="hidden"
        name={fields.customerType.name}
        value={customerType}
      />
      <input
        type="hidden"
        name={fields.turnstileToken.name}
        value={turnstileTokenControl.value ?? ""}
      />

      {formErrorMessage !== null && (
        <div
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
          プロフィールを更新しました
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

      <Input
        label="メールアドレス"
        type="email"
        value={defaultValues.email}
        disabled
        autoComplete="email"
        leadingIcon="IconMail"
      />
      <p className="text-xs text-muted-foreground -mt-4">
        メールアドレスはソーシャルアカウントから取得されます
      </p>

      <Input
        label="電話番号（任意）"
        autoComplete="tel"
        leadingIcon="IconPhone"
        {...(fields.phoneNumber.errors?.[0] !== undefined && {
          error: fields.phoneNumber.errors[0],
        })}
        {...getInputProps(fields.phoneNumber, { type: "tel" })}
      />

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.mypage_profile}
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
