"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import {
  checkActionRateLimit,
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  SIGNUP_TERMS_COOKIE_MAX_AGE_SECONDS,
  SIGNUP_TERMS_COOKIE_NAME,
  encodeSignupTermsCookie,
} from "@/shared/lib/signup-terms-cookie";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

const inputSchema = z.object({
  termsIds: z
    .array(z.string().uuid({ error: "規約IDが不正です" }))
    .max(50, { error: "同意できる規約数を超えています" })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "同じ規約に複数回同意することはできません",
    }),
  turnstileToken: z.string().optional(),
});

/**
 * ソーシャルログインの直前に呼び出され、同意した規約 ID を signed cookie に保存する。
 * OAuth callback 後の `mypage/layout.tsx` が新規顧客作成時にこの cookie を消費して
 * `recordTermsAgreementsCommand` を呼ぶ。
 *
 * 防御層: rate limit + Cloudflare Turnstile (未認証公開フォームの SSoT 規律)。
 * OAuth provider 側に PKCE + state があるため悪用リスクは低いが、CLAUDE.md
 * 「未認証公開フォーム必須」ハードルールに準拠する。
 */
export async function setSignupTermsAgreementCookie(input: {
  termsIds: readonly string[];
  turnstileToken?: string;
}): Promise<MutationResult<{ ok: true }>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  const turnstileResult = await validateTurnstile({
    token: parsed.data.turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.customer_signup_terms,
  });
  if (!turnstileResult.success) {
    return createMutationError(turnstileResult.error);
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SIGNUP_TERMS_COOKIE_NAME,
    encodeSignupTermsCookie(parsed.data.termsIds),
    {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SIGNUP_TERMS_COOKIE_MAX_AGE_SECONDS,
    },
  );

  return { ok: true };
}
