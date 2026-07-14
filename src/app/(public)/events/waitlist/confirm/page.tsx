import type { ReactElement, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { verifyWaitlistOfferToken } from "@/shared/lib/tokens/waitlist-offer-token";
import { getEventRegistrationForConfirm } from "@/shared/domain/events/waitlist-queries";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getBusinessInfo } from "@/public/data/business";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { formatSerializedDate } from "@/shared/lib/serialize";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { WaitlistConfirmForm } from "./_components/waitlist-confirm-form";

// トークンゲートのユーティリティページ。検索結果に出さない（events/cancel と同方針）。
export const metadata: Metadata = {
  title: "繰り上げ当選の確認",
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly searchParams: Promise<SearchParams>;
}

/**
 * イベント waitlist 繰り上げ当選の確認ランディング（無料チケット向け）。
 *
 * `getEventWaitlistOfferPaymentContext` が発行する
 * `/events/waitlist/confirm?token=...` の着地先。token は
 * `/reservation/complete` と同じく searchParams から直接読む
 * （events/cancel や /claim/* の HttpOnly cookie 転写パターンとは異なる —
 * `publicEventWaitlistConfirmSchema` が token を form field として運ぶ設計の
 * ため、cookie 転写を追加すると二重導線になる。詳細はタスク報告の deviation 参照）。
 */
export default async function WaitlistConfirmPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");

  // GET ページにも rate-limit を貼る。有効トークン1本で uncached DB findFirst を
  // 無制限ヒットできる経路を遮断する（events/cancel ページと同方針）。
  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return <InvalidView message="リクエストが多すぎます" />;
  }

  const sp = await searchParams;
  const token = typeof sp["token"] === "string" ? sp["token"] : null;
  if (!token) {
    return <InvalidView />;
  }

  const verified = verifyWaitlistOfferToken(token);
  if (!verified) {
    return <InvalidView />;
  }

  const registration = await getEventRegistrationForConfirm(
    verified.registrationId,
  );
  if (!registration) {
    return <InvalidView />;
  }

  if (registration.status === RegistrationStatus.EXPIRED) {
    // money-in-flight signal（Fix commit, レビュー Important #3）: cron レース
    // (Critical #1、query/claim 両側の paymentStatus PENDING 除外ガードで対策済)
    // や `confirmWaitlistOfferCommand` 自身の容量再チェック敗北（Task 9 report の
    // 「Capacity-race decision」— 決済成功後に別の確定が先着して枠を失うケース）
    // により、決済は成功/進行中なのに offer が EXPIRED 化することがある。この場合
    // paymentStatus は PENDING のまま維持され（会計上の虚偽表示になる FAILED は
    // 焼き付けない設計、webhook route.ts 参照）、stripeCheckoutSessionId は
    // checkout session 作成時のまま残る。両方揃うときのみ「決済確認中」の専用
    // 案内を出し、それ以外（一度も checkout に進まなかった／決済自体が失敗した
    // ケース）は従来どおり通常の期限切れページに送る。
    if (
      registration.paymentStatus === PaymentStatus.PENDING &&
      registration.stripeCheckoutSessionId
    ) {
      const { email: contactEmail } = await getBusinessInfo();
      return <PaymentInFlightView contactEmail={contactEmail} />;
    }
    redirect("/events/waitlist/expired");
  }

  if (registration.status === RegistrationStatus.CONFIRMED) {
    return (
      <Layout>
        <div className="border border-border p-6 text-center">
          <Heading level={2} className="!text-xl">
            {registration.event.title}
          </Heading>
          <p className="mt-3 text-base font-medium text-foreground">
            すでに参加が確定しています
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            マイページからご確認いただけます。
          </p>
        </div>
      </Layout>
    );
  }

  // getEventRegistrationForConfirm の status filter は WAITLISTED_OFFERED /
  // CONFIRMED / EXPIRED のみを返す。上の 2 分岐で処理済みのため、ここに到達する
  // のは WAITLISTED_OFFERED のみのはずだが、念のため明示的に防御する。
  if (registration.status !== RegistrationStatus.WAITLISTED_OFFERED) {
    return <InvalidView />;
  }

  // 有料チケットの繰り上げ当選は Stripe Checkout 経由。誤って ?token= 付きの
  // confirm リンクが有料チケットに踏まれた場合の fallback リダイレクト。
  if (registration.ticketPrice > 0) {
    redirect(`/events/waitlist/checkout/${token}`);
  }

  const turnstileSiteKey = await getTurnstileSiteKey();
  const expiresAtLabel = registration.expiresAt
    ? `${formatSerializedDate(registration.expiresAt, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })} ${formatSerializedDate(registration.expiresAt, {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;

  return (
    <Layout>
      <div className="border border-border">
        <div className="border-b border-border p-4 sm:p-6">
          <Heading level={2} className="!text-xl">
            {registration.event.title}
          </Heading>
        </div>
        <dl className="px-4 sm:px-6">
          <DetailRow label="開催日時">
            {formatSerializedDate(registration.slot.startAt, {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}{" "}
            {formatSerializedDate(registration.slot.startAt, {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            〜{" "}
            {formatSerializedDate(registration.slot.endAt, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </DetailRow>
          <DetailRow label="参加人数">{registration.quantity}名</DetailRow>
          {expiresAtLabel && (
            <DetailRow label="確定期限">{expiresAtLabel} まで</DetailRow>
          )}
        </dl>
      </div>

      <WaitlistConfirmForm
        token={token}
        turnstileSiteKey={turnstileSiteKey}
        expiresAtLabel={expiresAtLabel}
      />
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Layout({ children }: { children: ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>繰り上げ当選の確認</Heading>
        {children}
      </Stack>
    </PageLayout>
  );
}

interface DetailRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4 py-3 border-b border-border last:border-none">
      <dt className="text-sm text-muted-foreground sm:w-36 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function InvalidView({
  message = "リンクが無効または期限切れです",
}: {
  message?: string;
} = {}) {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">{message}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          お手数ですが
          <Link
            href="/events"
            className="underline underline-offset-4 hover:text-foreground"
          >
            イベント一覧
          </Link>
          からご確認ください。
        </p>
      </div>
    </Layout>
  );
}

/**
 * money-in-flight 専用ビュー（Fix commit, レビュー Important #3）。
 *
 * 「決済（Stripe）は成功/進行中だが、cron や容量再チェックのレースで offer が
 * EXPIRED 化した」ことを示す signal（status: EXPIRED + paymentStatus: PENDING +
 * stripeCheckoutSessionId あり）を検出したときのみ表示する。通常の期限切れ
 * （一度も決済に進まなかった／決済自体が失敗した）とは意図的に文言を分け、
 * 「お金は取られたかもしれないが忘れられてはいない」ことを伝える。
 */
function PaymentInFlightView({
  contactEmail,
}: {
  readonly contactEmail: string | null;
}) {
  return (
    <Layout>
      <div className="border border-border p-6 text-center">
        <p className="text-base font-medium text-foreground">
          決済を確認しております
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Stripe
          での決済処理と当サイトのキャンセル待ち処理のタイミングが重なった可能性があります。
          数時間以内に運営者から個別にご連絡いたしますので、お待ちください。
        </p>
        {contactEmail && (
          <p className="mt-4 text-sm">
            お急ぎの場合は
            <a
              href={`mailto:${contactEmail}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {contactEmail}
            </a>
            までご連絡ください。
          </p>
        )}
      </div>
    </Layout>
  );
}
