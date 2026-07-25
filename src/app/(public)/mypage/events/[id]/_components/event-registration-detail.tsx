"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/public/components/design-system/badge";
import { Button } from "@/public/components/design-system/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/public/components/design-system/dialog";
import { cancelEventRegistration } from "@/public/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatEventDateTimeRange } from "@/public/lib/format-event-date";
import {
  CANCELLABLE_REGISTRATION_STATUSES,
  getValidPaymentStatus,
  PAYMENT_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { isValidRegistrationStatus } from "@/shared/lib/validations/enums/guards";
import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { isEventVirtualAccessible } from "@/shared/domain/events/venue";
import { formatPrice } from "@/shared/lib/pricing/format";
import { getAppUrl } from "@/shared/lib/constants";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { EventCheckoutButton } from "../../_components/event-checkout-button";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import type { EventRegistrationListItem } from "../../_components/event-registration-list";

type BadgeVariant = "default" | "success" | "warning" | "info";

const REGISTRATION_STATUS_VARIANTS: Record<RegistrationStatus, BadgeVariant> = {
  [RegistrationStatus.CONFIRMED]: "success",
  [RegistrationStatus.CANCELLED]: "default",
  [RegistrationStatus.WAITLISTED]: "warning",
  [RegistrationStatus.WAITLISTED_OFFERED]: "info",
  [RegistrationStatus.EXPIRED]: "default",
};

const COUNTDOWN_TICK_MS = 60_000;

export interface EventRegistrationDetailProps {
  readonly registration: EventRegistrationListItem;
  readonly ticketName: string;
  readonly turnstileSiteKey: string | null;
  readonly nowIso: string;
  readonly receiptSerialNo: string | null;
  readonly waitlistPosition: number | null;
  readonly paymentEnabled: boolean;
}

export function EventRegistrationDetail({
  registration,
  ticketName,
  turnstileSiteKey,
  nowIso,
  receiptSerialNo,
  waitlistPosition,
  paymentEnabled,
}: EventRegistrationDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);
  const router = useRouter();

  const status = isValidRegistrationStatus(registration.status)
    ? registration.status
    : null;
  const paymentStatus = getValidPaymentStatus(registration.paymentStatus);
  const isPendingCheckout =
    registration.paymentStatus === PaymentStatus.PENDING;
  const canCancel =
    status !== null &&
    CANCELLABLE_REGISTRATION_STATUSES.some((s) => s === status) &&
    !isPendingCheckout;

  const statusLabel = status
    ? REGISTRATION_STATUS_LABELS[status]
    : registration.status;
  const statusVariant: BadgeVariant = status
    ? REGISTRATION_STATUS_VARIANTS[status]
    : "default";

  const handleConfirmCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelEventRegistration(
        registration.id,
        turnstileToken || undefined,
      );
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
        setTurnstileToken("");
      } else {
        setCancelDialogOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="border border-border">
      <div className="border-b border-border p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-xl font-medium text-foreground">
              {registration.event.title}
            </h2>
            <Link
              href={toAppRoute(`/events/${registration.event.slug}`)}
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-accent"
            >
              イベントページを見る
            </Link>
          </div>
          <Badge variant={statusVariant} className="shrink-0">
            {statusLabel}
          </Badge>
        </div>
      </div>

      <dl className="px-4 sm:px-6">
        <DetailRow label="日時">
          {formatEventDateTimeRange(
            registration.event.startTime,
            registration.event.endTime,
          )}
        </DetailRow>
        {registration.event.location && (
          <DetailRow label="場所">{registration.event.location}</DetailRow>
        )}
        <DetailRow label="チケット">{ticketName}</DetailRow>
        <DetailRow label="参加人数">{registration.quantity}名</DetailRow>
        <DetailRow label="合計金額">
          {formatPrice(registration.ticketTotalPrice, "無料")}
        </DetailRow>
        <DetailRow label="お支払い">
          {PAYMENT_STATUS_LABELS[paymentStatus]}
        </DetailRow>
        {isEventVirtualAccessible(registration.event) &&
          registration.event.meetingUrl &&
          (status === RegistrationStatus.CONFIRMED ? (
            <DetailRow label="参加 URL">
              <a
                href={registration.event.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all underline underline-offset-4 hover:text-foreground"
              >
                {registration.event.meetingUrl}
              </a>
            </DetailRow>
          ) : (
            <DetailRow label="参加 URL">参加確定後に表示されます</DetailRow>
          ))}
      </dl>

      {registration.status === RegistrationStatus.WAITLISTED && (
        <div className="border-t border-border px-4 py-4 sm:px-6">
          {waitlistPosition !== null ? (
            <p className="text-sm text-muted-foreground">
              現在
              <span className="mx-1 font-medium text-foreground tabular-nums">
                {waitlistPosition}
              </span>
              番目です。順番が来ましたら、メールでご連絡します。
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              順番が来ましたら、メールでご連絡します。
            </p>
          )}
        </div>
      )}

      {registration.status === RegistrationStatus.WAITLISTED_OFFERED &&
        registration.expiresAt !== null && (
          <div className="border-t border-border px-4 py-4 sm:px-6">
            <OfferCountdown
              expiresAt={registration.expiresAt}
              nowIso={nowIso}
            />
            {waitlistPosition !== null && (
              <p className="mt-2 text-sm text-muted-foreground">
                （現在の待機列順位:
                <span className="mx-1 font-medium text-foreground tabular-nums">
                  {waitlistPosition}
                </span>
                番目 / 前方の繰り上げ当選者を含みます）
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              確定用のリンクをメールでお送りしています。期限内にメール記載のリンクからお手続きください。
            </p>
            {isPendingCheckout && (
              <p className="mt-2 text-sm text-muted-foreground" role="status">
                決済処理中のため、この繰り上げ当選はキャンセルできません。決済を完了するか、Stripeで決済セッションをキャンセルしてから再度お試しください。
              </p>
            )}
          </div>
        )}

      {registration.status === RegistrationStatus.CONFIRMED && (
        <div className="border-t border-border px-4 py-4 sm:px-6">
          {paymentEnabled &&
            (registration.paymentStatus === PaymentStatus.UNPAID ||
              registration.paymentStatus === PaymentStatus.FAILED) &&
            registration.ticketTotalPrice > 0 && (
              <div className="mb-4">
                <EventCheckoutButton registrationId={registration.id} />
              </div>
            )}
          <AddToCalendar
            urls={buildAddToCalendarUrls({
              summary: registration.event.title,
              description: [
                `申込ID: ${registration.id.slice(0, 8).toUpperCase()}`,
                `イベント: ${registration.event.title}`,
                `参加人数: ${registration.quantity}名`,
              ].join("\n"),
              startTime: new Date(registration.event.startTime),
              endTime: new Date(registration.event.endTime),
              ...(registration.event.location != null
                ? { location: registration.event.location }
                : {}),
              icsDownloadUrl: `${getAppUrl()}/api/calendar/event/${registration.id}`,
            })}
          />
        </div>
      )}

      {receiptSerialNo && (
        <div className="border-t border-border px-4 py-4 sm:px-6">
          <p className="mb-3 text-sm text-muted-foreground">
            適格請求書 (領収書) は PDF でダウンロードできます。
          </p>
          <a
            href={`/api/receipts/${receiptSerialNo}/pdf`}
            download={`receipt-${receiptSerialNo}.pdf`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            領収書をダウンロード
          </a>
        </div>
      )}

      {canCancel && (
        <div className="border-t border-border px-4 py-4 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              setError(null);
              setTurnstileToken("");
              setCancelDialogOpen(true);
            }}
          >
            申込をキャンセル
          </Button>

          <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <DialogContent
              footer={
                <DialogFooter
                  role="group"
                  aria-label="イベント申込キャンセル操作"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelDialogOpen(false)}
                    disabled={isPending}
                    className="w-full sm:w-auto"
                  >
                    閉じる
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConfirmCancel}
                    disabled={isPending}
                    className="w-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 sm:w-auto"
                  >
                    {isPending ? "キャンセル中..." : "キャンセルする"}
                  </Button>
                </DialogFooter>
              }
            >
              <DialogHeader>
                <DialogTitle>申込キャンセルの確認</DialogTitle>
                <DialogDescription>
                  「{registration.event.title}」の申込をキャンセルしますか？
                  この操作は取り消せません。
                </DialogDescription>
              </DialogHeader>

              <TurnstileWidget
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                action={TURNSTILE_ACTIONS.mypage_event_registration_cancel}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
              />

              {error != null && (
                <div
                  className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-none sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-36">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-foreground [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function OfferCountdown({
  expiresAt,
  nowIso,
}: {
  readonly expiresAt: string;
  readonly nowIso: string;
}) {
  const [remainingMs, setRemainingMs] = useState(
    () => new Date(expiresAt).getTime() - new Date(nowIso).getTime(),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <p className="text-sm font-medium text-info" aria-live="polite">
      {formatOfferCountdown(remainingMs)}
    </p>
  );
}

function formatOfferCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "まもなく確定期限になります";
  }
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `確定期限まで残り${String(hours)}時間${String(minutes)}分`;
  }
  return `確定期限まで残り${String(minutes)}分`;
}
