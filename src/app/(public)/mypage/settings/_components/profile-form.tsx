"use client";

import { useState } from "react";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  customerProfileSchema,
  type CustomerProfileInput,
} from "@/shared/lib/validations/customer-profile";
import { updateProfileAction } from "../../_shared/actions/profile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  readonly defaultValues: {
    readonly lastName: string;
    readonly firstName: string;
    readonly email: string;
    readonly phoneNumber: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { form, isPending, onSubmit } = usePublicForm<CustomerProfileInput>(
    customerProfileSchema,
    async (data) => {
      setErrorMessage(null);
      setShowSuccess(false);
      const result = await updateProfileAction(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setShowSuccess(true);
      }
      return result;
    },
    {
      defaultValues: {
        lastName: defaultValues.lastName,
        firstName: defaultValues.firstName,
        phoneNumber: defaultValues.phoneNumber,
      },
    },
  );

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      {errorMessage != null && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {showSuccess && (
        <div
          className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm text-foreground"
          role="status"
        >
          プロフィールを更新しました
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="姓"
          required
          autoComplete="family-name"
          {...form.register("lastName")}
          {...(form.formState.errors.lastName?.message && {
            error: form.formState.errors.lastName.message,
          })}
        />
        <Input
          label="名"
          required
          autoComplete="given-name"
          {...form.register("firstName")}
          {...(form.formState.errors.firstName?.message && {
            error: form.formState.errors.firstName.message,
          })}
        />
      </div>

      <Input
        label="メールアドレス"
        type="email"
        value={defaultValues.email}
        disabled
        autoComplete="email"
      />
      <p className="text-xs text-muted-foreground -mt-2">
        メールアドレスはソーシャルアカウントから取得されます
      </p>

      <Input
        label="電話番号（任意）"
        type="tel"
        autoComplete="tel"
        {...form.register("phoneNumber")}
        {...(form.formState.errors.phoneNumber?.message && {
          error: form.formState.errors.phoneNumber.message,
        })}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
