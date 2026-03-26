"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
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
// Form state
// ---------------------------------------------------------------------------

type FormState = { success: true } | { error: string } | null;

async function formAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return updateProfileAction(formData);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [state, dispatch, isPending] = useActionState(formAction, null);

  const showSuccess = state != null && "success" in state && state.success;
  const error = state != null && "error" in state ? state.error : null;

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        // Clear success message after 3 seconds — state resets on next submission
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  return (
    <form action={dispatch} className="max-w-md space-y-4">
      {error != null && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
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
          name="lastName"
          required
          defaultValue={defaultValues.lastName}
          autoComplete="family-name"
        />
        <Input
          label="名"
          name="firstName"
          required
          defaultValue={defaultValues.firstName}
          autoComplete="given-name"
        />
      </div>

      <Input
        label="メールアドレス"
        name="email"
        type="email"
        value={defaultValues.email}
        disabled
        autoComplete="email"
      />
      <p className="text-xs text-muted-foreground -mt-2">
        メールアドレスはソーシャルアカウントから取得されます
      </p>

      <Input
        label="電話番号"
        name="phoneNumber"
        type="tel"
        defaultValue={defaultValues.phoneNumber}
        autoComplete="tel"
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
