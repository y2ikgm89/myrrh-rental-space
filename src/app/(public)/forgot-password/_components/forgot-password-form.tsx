"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/shared/lib/auth-client";
import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Stack } from "@/public/components/design-system/stack";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);

    startTransition(async () => {
      const { error: fetchError } = await authClient.$fetch(
        "/request-password-reset",
        {
          method: "POST",
          body: { email, redirectTo: "/reset-password" },
        },
      );

      if (fetchError) {
        setError(fetchError.message ?? "エラーが発生しました");
      } else {
        setSubmitted(true);
      }
    });
  };

  if (submitted) {
    return (
      <Stack gap="lg">
        <div className="border border-border p-6 text-center">
          <p className="text-lg font-medium text-foreground">
            メールを送信しました
          </p>
          <p className="mt-2 text-muted-foreground">
            入力されたメールアドレスにパスワードリセットのリンクをお送りしました。
            メールをご確認ください。
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            メールが届かない場合は、迷惑メールフォルダをご確認いただくか、
            再度お試しください。
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setSubmitted(false);
            setEmail("");
          }}
        >
          別のメールアドレスで試す
        </Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="lg">
        <Input
          label="メールアドレス"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com"
          autoComplete="email"
          disabled={isPending}
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
          {isPending ? "送信中..." : "リセットリンクを送信"}
        </Button>
      </Stack>
    </form>
  );
}
