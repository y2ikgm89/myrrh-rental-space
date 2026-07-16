import type { ReactElement } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { verifyEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import { eventDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import { getEventRegistrationForClaim } from "@/shared/domain/events/registration-queries";
import { isEventVirtualAccessible } from "@/shared/domain/events/venue";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { formatSerializedDate } from "@/shared/lib/serialize";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME } from "@/shared/lib/constants/claim-token-cookie-names";
import { SocialLoginButtons } from "@/app/(public)/login/_components/social-login-buttons";
import { ClaimConfirmForm } from "./_components/claim-confirm-form";

// トークンゲートのユーティリティページ。検索結果に出さない（mypage / login と同方針）。
export const metadata: Metadata = {
  title: "イベント申込をマイページに追加",
  robots: { index: false, follow: false },
};

/**
 * ゲストのイベント参加申込の「マイページに追加」ページ。
 *
 * page.tsx は読み取り専用（トークン検証 + 申込概要表示のみ）で、実際の claim
 * 書込は `ClaimConfirmForm` からの Server Action 呼び出しでのみ起こる。
 * `<Link>` prefetch や再訪問がそのままページ描画され、意図しない claim を
 * 誘発しないようにするため（`_actions/claim.ts` 参照）。
 */
export default async function ClaimEventRegistrationPage(): Promise<ReactElement> {
  await connection();

  // GET ページにも rate-limit を貼る。有効トークン 1 本で uncached DB findFirst を
  // 無制限ヒットできる経路を遮断する（`reservation/cancel` ページと同方針）。
  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return <InvalidView message="リクエストが多すぎます" />;
  }

  // proxy（middleware）が `?token=...` を HttpOnly cookie に転写済み。
  // ここでは cookie のみ読み、URL クエリにトークンを残さない。
  const cookieStore = await cookies();
  const token = cookieStore.get(
    EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME,
  )?.value;
  if (!token) {
    return <InvalidView />;
  }

  const verified = verifyEventRegistrationClaimToken(token, eventDeadlineNow());
  if (!verified.valid) {
    return <InvalidView />;
  }

  const registration = await getEventRegistrationForClaim(
    verified.eventRegistrationId,
  );
  if (!registration) {
    return <InvalidView />;
  }

  const [user, turnstileSiteKey, requiredTerms] = await Promise.all([
    getCurrentCustomerUser(),
    getTurnstileSiteKey(),
    getRequiredTermsByScope(TermsScope.LOGIN_SIGNUP),
  ]);

  return (
    <Layout>
      <div className="border border-border p-4 sm:p-6">
        <Heading level={2} className="!text-xl">
          {registration.eventTitle}
        </Heading>
        <p className="mt-2 text-sm text-muted-foreground">
          開催日:{" "}
          {formatSerializedDate(registration.startTime, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        {isEventVirtualAccessible(registration) && registration.meetingUrl && (
          <p className="mt-2 break-all text-sm text-muted-foreground">
            参加 URL:{" "}
            <a
              href={registration.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-accent"
            >
              {registration.meetingUrl}
            </a>
          </p>
        )}
      </div>

      {user ? (
        <ClaimConfirmForm />
      ) : (
        <Stack gap="md">
          <p className="text-sm text-muted-foreground">
            Google または LINE
            でログイン（初めての方は自動的にアカウントが作成されます）すると、この申込をマイページに追加できます。
          </p>
          <SocialLoginButtons
            requiredTerms={requiredTerms}
            turnstileSiteKey={turnstileSiteKey}
            callbackURL="/claim/event-registration"
          />
        </Stack>
      )}
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>イベント申込をマイページに追加</Heading>
        {children}
      </Stack>
    </PageLayout>
  );
}

function InvalidView({
  message = "リンクの有効期限が切れました",
}: {
  message?: string;
} = {}): ReactElement {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">{message}</p>
      </div>
    </Layout>
  );
}
