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
  readonly turnstileSiteKey: string | null;
};

export function ForgotPasswordForm({ turnstileSiteKey }: Props) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);

    if (turnstileSiteKey && !turnstileToken) {
      setError("セキュリティ検証を完了してください。");
      return;
    }

    startTransition(async () => {
      const { error: fetchError } = await adminAuthClient.$fetch(
        "/request-password-reset",
        {
          method: "POST",
          body: { email, redirectTo: "/reset-password" },
          ...(turnstileToken && {
            headers: { "x-captcha-response": turnstileToken },
          }),
        },
      );

      if (fetchError) {
        setError(fetchError.message ?? "エラーが発生しました");
        turnstileRef.current?.reset();
        setTurnstileToken("");
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
            setTurnstileToken("");
            turnstileRef.current?.reset();
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

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.admin_password_reset_request}
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
          {isPending ? "送信中..." : "リセットリンクを送信"}
        </Button>
      </Stack>
    </form>
  );
}
