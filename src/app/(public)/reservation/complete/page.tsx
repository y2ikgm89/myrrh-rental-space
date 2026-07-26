import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { AddToCalendar } from "@/public/components/ui/add-to-calendar";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { verifyCompleteToken } from "@/shared/lib/reservation-complete-token";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { getReservationForCompletion } from "@/shared/domain/reservations/customer-queries";
import { getCalendarEmailSettings } from "@/shared/domain/settings/queries/notification";
import { getPublicRefundPolicySettings } from "@/shared/domain/settings/public-queries";
import { formatRefundPolicyDisplayLines } from "@/shared/domain/refund/format-refund-policy-display";
import { RefundPolicyNotice } from "@/app/(public)/_shared/components/ui/refund-policy-notice";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { formatPrice } from "@/shared/lib/pricing/format";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";

// 予約直後のリダイレクト先。トークンで予約を特定する一時ページのため検索結果に出さない。
export const metadata: Metadata = {
  title: "ご予約ありがとうございます",
  robots: { index: false, follow: false },
};

// proxy（middleware）が `?token=...` を HttpOnly cookie に転写済み。
// ここでは cookie のみ読み、URL クエリにトークンを残さない（ログ・履歴漏洩遮断、
// /reservation/cancel と同方針）。
const COMPLETE_TOKEN_COOKIE_NAME = "complete-token";

export default async function ReservationCompletePage(): Promise<ReactElement> {
  await connection();

  // FEAT-3PLANE-04: /reservation と対称に reservation feature OFF 時は 404。
  // 完了ページはトークン検証で予約詳細を露出するため、feature OFF 時に
  // 残しておくと「予約は無効化されているが完了画面だけ生きている」という
  // 可視性契約破りになる。
  await requireFeatureEnabled("reservation");

  // GET ページにも rate-limit を貼る。有効トークン 1 本で uncached DB findFirst を
  // 無制限ヒットできる経路を遮断（publicQueryRateLimiter: 30/min/IP、/reservation/cancel と同方針）。
  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);

  const cookieStore = await cookies();
  const token = cookieStore.get(COMPLETE_TOKEN_COOKIE_NAME)?.value ?? null;

  const verified =
    limit.success && token
      ? verifyCompleteToken(token, reservationDeadlineNow())
      : ({ valid: false } as const);

  const [user, reservation, calendarSettings, refundPolicy] = await Promise.all(
    [
      getCurrentCustomerUser(),
      verified.valid
        ? getReservationForCompletion(verified.reservationId)
        : Promise.resolve(null),
      getCalendarEmailSettings(),
      getPublicRefundPolicySettings(),
    ],
  );
  const refundPolicyLines = refundPolicy
    ? formatRefundPolicyDisplayLines(refundPolicy)
    : null;

  const isLoggedIn = user != null;
  const isCancelled = reservation?.status === ReservationStatus.CANCELLED;
  const address = reservation?.space.location?.address ?? null;
  const hasSmartLock =
    !isCancelled && (reservation?.space.smartLockDevice?.isActive ?? false);

  const claimUrl =
    reservation && !isLoggedIn
      ? `/claim/reservation?token=${createReservationClaimToken(reservation.id)}`
      : null;

  const calendarUrls =
    reservation && !isCancelled && calendarSettings.addToCalendarLinksEnabled
      ? buildAddToCalendarUrls({
          summary: `【予約】${reservation.space.name}`,
          description: [
            `予約番号: ${reservation.id.slice(0, 8).toUpperCase()}`,
            `スペース: ${reservation.space.name}`,
          ].join("\n"),
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          ...(address ? { location: address } : {}),
        })
      : null;

  return (
    <Layout>
      <div className="text-center">
        {isCancelled ? (
          <>
            <p className="mb-3 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
              Cancelled
            </p>
            <Heading level={1}>この予約はキャンセルされました</Heading>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              こちらのご予約は既にキャンセル済みです。
              <br className="hidden sm:inline" />
              お心当たりがない場合はお問い合わせください。
            </p>
          </>
        ) : (
          <>
            <p className="mb-3 text-xs font-medium uppercase tracking-eyebrow text-accent">
              Confirmed
            </p>
            <Heading level={1}>ご予約ありがとうございます</Heading>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              ご予約を受け付けました。確認メールをお送りしましたので、
              <br className="hidden sm:inline" />
              内容をご確認ください。
            </p>
            {hasSmartLock && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                スマートロックの解錠用暗証番号は、発行手続きの完了後に確認メールで
                数分以内にお送りします。
              </p>
            )}
          </>
        )}
      </div>

      {reservation && (
        <div className="border border-border">
          <div className="p-4 sm:p-6 border-b border-border">
            <Heading level={2} className="!text-xl">
              {reservation.space.name}
            </Heading>
            {address && (
              <p className="mt-1 text-sm text-muted-foreground">{address}</p>
            )}
          </div>

          <dl className="px-4 sm:px-6">
            <DetailRow label="予約番号">
              {reservation.id.slice(0, 8).toUpperCase()}
            </DetailRow>
            <DetailRow label="利用日">
              {formatSerializedDate(reservation.startTime, {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </DetailRow>
            <DetailRow label="利用時間">
              {formatSerializedDate(reservation.startTime, {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              〜{" "}
              {formatSerializedDate(reservation.endTime, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </DetailRow>
            <DetailRow label="合計金額">
              {formatPrice(reservation.totalPrice, "未定")}
            </DetailRow>
          </dl>
        </div>
      )}

      {calendarUrls && (
        <div className="border border-border p-4 sm:p-6">
          <AddToCalendar urls={calendarUrls} variant="public" />
        </div>
      )}

      {!isCancelled && (
        <RefundPolicyNotice
          lines={refundPolicyLines}
          className="border border-border p-4 sm:p-6"
        />
      )}

      <NextSteps
        isLoggedIn={isLoggedIn}
        isPending={reservation?.status === ReservationStatus.PENDING}
        isCancelled={isCancelled}
        claimUrl={claimUrl}
      />
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        {children}
      </Stack>
    </PageLayout>
  );
}

interface DetailRowProps {
  readonly label: string;
  readonly children: React.ReactNode;
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

function NextSteps({
  isLoggedIn,
  isPending,
  isCancelled,
  claimUrl,
}: {
  readonly isLoggedIn: boolean;
  readonly isPending: boolean;
  readonly isCancelled: boolean;
  readonly claimUrl: string | null;
}) {
  return (
    <div className="border border-border p-4 sm:p-6">
      <Heading level={2} className="!text-base">
        次のステップ
      </Heading>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {isPending && (
          <li>
            ご予約は現在確認中です。確定しましたらメールでお知らせします。
          </li>
        )}
        {!isCancelled &&
          (isLoggedIn ? (
            <li>
              <Link
                href={toAppRoute("/mypage")}
                className="underline underline-offset-4 hover:text-foreground"
              >
                マイページ
              </Link>
              から予約の確認・変更・キャンセルができます。
            </li>
          ) : (
            <li>
              ご予約の確認・キャンセルは、確認メール内のリンクから行えます。
            </li>
          ))}
        {!isCancelled && claimUrl && (
          <li>
            <a
              href={claimUrl}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Google/LINEでこの予約をマイページに追加する
            </a>
          </li>
        )}
        <li>
          ご不明な点は
          <Link
            href={toAppRoute("/contact")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            お問い合わせ
          </Link>
          ください。
        </li>
      </ul>
    </div>
  );
}
