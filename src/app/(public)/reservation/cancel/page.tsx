import type { ReactElement } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import {
  verifyCancelToken,
  tokenFingerprint,
} from "@/shared/lib/reservation-cancel-token";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { getReservationForGuestCancel } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { isWithinDeadline } from "@/shared/domain/reservations/deadline";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { formatPrice } from "@/shared/lib/pricing/format";
import { toAppRoute } from "@/shared/lib/typed-routes";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { GuestCancelForm } from "./_components/guest-cancel-form";

// トークンゲートのユーティリティページ。検索結果に出さない（mypage / login と同方針）。
export const metadata: Metadata = {
  title: "予約のキャンセル",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANCELLABLE_STATUSES = new Set(ACTIVE_RESERVATION_STATUSES);
const CANCEL_TOKEN_COOKIE_NAME = "cancel-token";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function GuestCancelPage(): Promise<ReactElement> {
  await connection();

  // proxy（middleware）が `?token=...` を HttpOnly cookie に転写済み。
  // ここでは cookie のみ読み、URL クエリにトークンを残さない（ログ・履歴漏洩遮断）。
  const cookieStore = await cookies();
  const token = cookieStore.get(CANCEL_TOKEN_COOKIE_NAME)?.value ?? null;

  // GET ページにも rate-limit を貼る。有効トークン 1 本で uncached DB findFirst を
  // 無制限ヒットできる経路を遮断（publicQueryRateLimiter: 30/min/IP）。
  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return <TooManyRequestsView />;
  }

  if (!token) {
    return <InvalidLinkView />;
  }

  const now = reservationDeadlineNow();
  const verified = verifyCancelToken(token, now);

  if (!verified.valid) {
    // WARNING ログ: 失敗 token の流通量・指紋を観測し brute-force / 漁る攻撃を検知
    logError(
      new Error(`Guest cancel token verify failed: ${verified.reason}`),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "guestCancelPageVerify",
          reason: verified.reason,
          ip: clientIp,
          tokenFingerprint: tokenFingerprint(token),
        },
      },
    );
    return <InvalidLinkView reason={verified.reason} />;
  }

  const [reservation, deadlineSettings, turnstileSiteKey] = await Promise.all([
    getReservationForGuestCancel(verified.reservationId),
    getReservationDeadlineSettings(),
    getTurnstileSiteKey(),
  ]);

  if (!reservation) {
    return <InvalidLinkView />;
  }

  if (!CANCELLABLE_STATUSES.has(reservation.status)) {
    return (
      <Layout>
        <div className="border border-border p-6 text-center">
          <p className="text-base font-medium text-foreground">
            この予約はすでにキャンセル済みです
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            ご不明な点は
            <Link
              href={toAppRoute("/contact")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              お問い合わせ
            </Link>
            ください。
          </p>
        </div>
      </Layout>
    );
  }

  const canCancel = isWithinDeadline(
    reservation.startTime,
    deadlineSettings.cancellationDeadlineHours,
    now,
  );

  if (!canCancel) {
    return (
      <Layout>
        <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-base font-medium text-foreground">
            キャンセル受付期限を過ぎています
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            ご利用日の {deadlineSettings.cancellationDeadlineHours}{" "}
            時間前を過ぎているためオンラインキャンセルはできません。
            <br />
            <Link
              href={toAppRoute("/contact")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              お問い合わせ
            </Link>
            よりご連絡ください。
          </p>
        </div>
      </Layout>
    );
  }

  const guestName =
    reservation.guestFirstName || reservation.guestLastName
      ? `${reservation.guestLastName ?? ""} ${reservation.guestFirstName ?? ""}`.trim()
      : null;

  return (
    <Layout>
      {/* Reservation summary */}
      <div className="border border-border">
        <div className="p-4 sm:p-6 border-b border-border">
          <Heading level={2} className="!text-xl">
            {reservation.space.name}
          </Heading>
          {guestName && (
            <p className="mt-1 text-sm text-muted-foreground">{guestName} 様</p>
          )}
        </div>

        <dl className="px-4 sm:px-6">
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

        <div className="px-4 sm:px-6 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            キャンセル期限: ご利用日の{" "}
            {deadlineSettings.cancellationDeadlineHours} 時間前まで
          </p>
        </div>
      </div>

      <GuestCancelForm turnstileSiteKey={turnstileSiteKey} />
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
        <Heading level={1}>予約のキャンセル</Heading>
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

/**
 * **意図的に invalid と expired を同一文言に統合**: 期限切れ表示で「これは正規
 * トークン形式」という弱オラクル情報を漏らさない（/login や /mypage と同 pattern）。
 * SR には reason 情報は提供せず、文言は単一に保つ。
 *
 * 漏洩窓制限のためトークン寿命に 7 日 cap を掛けているため、policy 上は
 * まだキャンセル可能でもリンクだけ先に expired となるケースがある。代替経路として
 * 会員にはマイページ・ゲストにはお問い合わせを併記する。
 */
function InvalidLinkView({
  reason: _reason,
}: {
  reason?: "invalid" | "expired";
} = {}) {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          キャンセルリンクが無効または期限切れです
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクが正しくないか、有効期限が切れている可能性があります。
        </p>
        <Stack gap="sm" className="mt-4 text-sm text-muted-foreground">
          <p>
            会員の方は
            <Link
              href={toAppRoute("/mypage")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              マイページ
            </Link>
            から直接キャンセルできます。
          </p>
          <p>
            会員でない方は
            <Link
              href={toAppRoute("/contact")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              お問い合わせ
            </Link>
            よりご連絡ください。
          </p>
        </Stack>
      </div>
    </Layout>
  );
}

function TooManyRequestsView() {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          リクエストが多すぎます
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          しばらく時間をおいてから再度お試しください。
        </p>
      </div>
    </Layout>
  );
}
