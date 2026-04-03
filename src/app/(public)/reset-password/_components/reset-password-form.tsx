"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/shared/lib/auth-client";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Stack } from "@/public/components/design-system/stack";

type Props = {
  readonly token: string;
};

export function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

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

    startTransition(async () => {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        setError(result.error.message ?? "パスワードのリセットに失敗しました");
      } else {
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <Stack gap="lg">
        <div className="border border-border bg-surface p-6 text-center">
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
          {...(fieldError ? { error: fieldError } : {})}
        />

        {error ? (
          <div
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
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
