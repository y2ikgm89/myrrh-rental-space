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
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { TermsConsentChecklist } from "@/app/(public)/_shared/components/forms/TermsConsentChecklist";
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
  /** 認証後のリダイレクト先。省略時は `/mypage`（既存動作を維持）。 */
  readonly callbackURL?: string;
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
  callbackURL = "/mypage",
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
      callbackURL,
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

      <TermsConsentChecklist
        terms={requiredTerms}
        agreedIds={agreedIds}
        onToggle={handleToggleTerm}
        disabled={pending !== null}
        heading="ご利用規約への同意"
        variant="boxed"
      />

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

      {/* LINE — 公式ブランドガイドライン: line-brand 背景 + line-brand-foreground テキスト/アイコン */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleSignIn("line")}
        className={cn(
          "flex w-full items-center justify-center gap-3 bg-line-brand px-6 py-3 text-sm font-medium text-line-brand-foreground transition-opacity duration-200",
          "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-brand focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <LineLogo />
        {pending === "line" ? "リダイレクト中..." : "LINEでログイン"}
      </button>
    </Stack>
  );
}
