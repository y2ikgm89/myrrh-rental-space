"use client";

import { useRef, useState } from "react";
import { signIn } from "@/shared/lib/customer-auth-client";
import { cn } from "@/shared/lib/cn";
import { Stack } from "@/public/components/design-system/stack";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  GoogleLogo,
  LineLogo,
} from "@/public/components/ui/social-provider-logos";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { setSignupTermsAgreementCookie } from "./signup-terms-action";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Provider = "google" | "line";

export interface SignupTermItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

interface SocialLoginButtonsProps {
  readonly requiredTerms?: readonly SignupTermItem[];
  readonly turnstileSiteKey: string | null;
}

/* ------------------------------------------------------------------ */
/*  Error message translation                                          */
/* ------------------------------------------------------------------ */

const ERROR_MESSAGES: Record<string, string> = {
  "Provider not found": "このログイン方法は現在利用できません。",
};

function toUserMessage(raw: string): string {
  return ERROR_MESSAGES[raw] ?? "認証に失敗しました。もう一度お試しください。";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SocialLoginButtons({
  requiredTerms = [],
  turnstileSiteKey,
}: SocialLoginButtonsProps) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreedIds, setAgreedIds] = useState<readonly string[]>([]);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);

  const allTermsAgreed =
    requiredTerms.length === 0 ||
    requiredTerms.every((term) => agreedIds.includes(term.id));

  function handleToggleTerm(id: string) {
    setAgreedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const handleSignIn = async (provider: Provider) => {
    setPending(provider);
    setError(null);

    if (turnstileSiteKey && !turnstileToken) {
      setError("セキュリティ検証を完了してください。");
      setPending(null);
      return;
    }

    // 規約同意を signed cookie に保存 + Turnstile 検証（OAuth callback まで保持）
    const result = await setSignupTermsAgreementCookie({
      termsIds: agreedIds,
      ...(turnstileToken && { turnstileToken }),
    });
    if (isMutationError(result)) {
      setError(result.error);
      setPending(null);
      turnstileRef.current?.reset();
      setTurnstileToken("");
      return;
    }

    void signIn.social({
      provider,
      callbackURL: "/mypage",
      fetchOptions: {
        onSuccess() {
          // Better Auth がリダイレクトを処理する
        },
        onError(ctx) {
          if (ctx.response.status === 429) {
            const retryAfter = ctx.response.headers.get("retry-after");
            setError(
              `リクエストが多すぎます。${retryAfter ? `${retryAfter}秒後に` : "しばらく待ってから"}お試しください。`,
            );
          } else {
            setError(toUserMessage(ctx.error.message ?? ""));
          }
          setPending(null);
        },
      },
    });
  };

  const disabled =
    pending !== null ||
    !allTermsAgreed ||
    (turnstileSiteKey !== null && !turnstileToken);

  return (
    <Stack gap="lg">
      {error && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive text-center"
          role="alert"
        >
          {error}
        </div>
      )}

      {requiredTerms.length > 0 && (
        <div className="space-y-3 border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            ご利用規約への同意
          </p>
          {requiredTerms.map((term) => {
            const isChecked = agreedIds.includes(term.id);
            return (
              <label
                key={term.id}
                className="flex min-h-11 items-start gap-3 py-1"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 border-border accent-accent"
                  checked={isChecked}
                  disabled={pending !== null}
                  onChange={() => handleToggleTerm(term.id)}
                  aria-label={`${term.title}に同意する`}
                />
                <span className="text-sm text-muted-foreground">
                  <a
                    href={`/terms/${term.slug}`}
                    target="_blank"
                    className="text-accent underline transition-colors hover:text-foreground"
                  >
                    {term.title}
                  </a>
                  に同意します
                </span>
              </label>
            );
          })}
        </div>
      )}

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.customer_signup_terms}
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
        onError={() => setTurnstileToken("")}
      />

      {/* Google — 公式ブランドガイドライン: 白背景 + カラーロゴ + Roboto テキスト */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleSignIn("google")}
        className={cn(
          "flex w-full items-center justify-center gap-3 border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors duration-200",
          "hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <GoogleLogo />
        {pending === "google" ? "リダイレクト中..." : "Googleでログイン"}
      </button>

      {/* LINE — 公式ブランドガイドライン: #06C755 背景 + 白テキスト/アイコン */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleSignIn("line")}
        className={cn(
          "flex w-full items-center justify-center gap-3 bg-[#06C755] px-6 py-3 text-sm font-medium text-white transition-opacity duration-200",
          "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755] focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <LineLogo />
        {pending === "line" ? "リダイレクト中..." : "LINEでログイン"}
      </button>
    </Stack>
  );
}
