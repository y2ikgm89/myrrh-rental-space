"use client";

import { useRef, useState, useTransition } from "react";
import { adminAuthClient } from "@/shared/lib/admin-auth-client";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Stack } from "@/public/components/design-system/stack";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

type Props = {
  readonly token: string;
  readonly turnstileSiteKey: string | null;
};

export function ResetPasswordForm({ token, turnstileSiteKey }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);
    setFieldError(undefined);

    if (password !== confirmPassword) {
      setFieldError("パスワードが一致しません");
      return;
    }

    if (password.length < 8) {
      setFieldError("パスワードは8文字以上で入力してください");
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setError("セキュリティ検証を完了してください。");
      return;
    }

    startTransition(async () => {
      const result = await adminAuthClient.resetPassword({
        newPassword: password,
        token,
        ...(turnstileToken && {
          fetchOptions: {
            headers: { "x-captcha-response": turnstileToken },
          },
        }),
      });

      if (result.error) {
        setError(result.error.message ?? "パスワードのリセットに失敗しました");
        turnstileRef.current?.reset();
        setTurnstileToken("");
      } else {
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <Stack gap="lg">
        <div className="border border-border p-6 text-center">
          <p className="text-lg font-medium text-foreground">
            パスワードを変更しました
          </p>
          <p className="mt-2 text-muted-foreground">
            新しいパスワードでログインしてください。
          </p>
        </div>
        <Button href="/login">ログインページへ</Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="lg">
        <Input
          label="新しいパスワード"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8文字以上"
          autoComplete="new-password"
          disabled={isPending}
        />

        <Input
          label="パスワード（確認）"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="もう一度入力してください"
          autoComplete="new-password"
          disabled={isPending}
          {...(fieldError && { error: fieldError })}
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.admin_password_reset}
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
          onError={() => setTurnstileToken("")}
        />

        {error ? (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "変更中..." : "パスワードを変更"}
        </Button>
      </Stack>
    </form>
  );
}
