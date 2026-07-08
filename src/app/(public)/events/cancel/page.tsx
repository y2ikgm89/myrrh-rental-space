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
} from "@/shared/lib/event-registration-cancel-token";
import { getEventRegistrationForGuestCancel } from "@/shared/domain/events/registration-queries";
import { eventRegistrationDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { formatSerializedDate } from "@/shared/lib/serialize";
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

// トークンゲートのユーティリティページ。検索結果に出さない（reservation/cancel と同方針）。
export const metadata: Metadata = {
  title: "イベント参加申込のキャンセル",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_CANCEL_TOKEN_COOKIE_NAME = "event-cancel-token";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function GuestEventCancelPage(): Promise<ReactElement> {
  await connection();

  // proxy（middleware）が `?token=...` を HttpOnly cookie に転写済み。
  // ここでは cookie のみ読み、URL クエリにトークンを残さない（ログ・履歴漏洩遮断）。
  const cookieStore = await cookies();
  const token = cookieStore.get(EVENT_CANCEL_TOKEN_COOKIE_NAME)?.value ?? null;

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

  const now = eventRegistrationDeadlineNow();
  const verified = verifyCancelToken(token, now);

  if (!verified.valid) {
    // WARNING ログ: 失敗 token の流通量・指紋を観測し brute-force / 漁る攻撃を検知
    logError(
      new Error(`Guest event cancel token verify failed: ${verified.reason}`),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "guestEventCancelPageVerify",
          reason: verified.reason,
          ip: clientIp,
          tokenFingerprint: tokenFingerprint(token),
        },
      },
    );
    return <InvalidLinkView reason={verified.reason} />;
  }

  const [registration, turnstileSiteKey] = await Promise.all([
    getEventRegistrationForGuestCancel(verified.registrationId),
    getTurnstileSiteKey(),
  ]);

  if (!registration) {
    return <InvalidLinkView />;
  }

  if (registration.status !== RegistrationStatus.CONFIRMED) {
    return (
      <Layout>
        <div className="border border-border p-6 text-center">
          <p className="text-base font-medium text-foreground">
            この申込はすでにキャンセル済みです
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

  return (
    <Layout>
      {/* Registration summary */}
      <div className="border border-border">
        <div className="p-4 sm:p-6 border-b border-border">
          <Heading level={2} className="!text-xl">
            {registration.event.title}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            {registration.name} 様
          </p>
        </div>

        <dl className="px-4 sm:px-6">
          <DetailRow label="開催日">
            {formatSerializedDate(registration.slot.startAt, {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </DetailRow>
          <DetailRow label="時間">
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
        </dl>
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
        <Heading level={1}>イベント参加申込のキャンセル</Heading>
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
 * トークン形式」という弱オラクル情報を漏らさない（reservation/cancel と同方針）。
 *
 * イベントには予約のような設定可能な「キャンセル受付期限」が無く、トークンの exp は
 * スロット開始時刻（7 日 cap 付き）に紐づく。開催後にリンクを踏むと自然に
 * expired 表示になる（別途の期限チェックを重複実装しない）。
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
