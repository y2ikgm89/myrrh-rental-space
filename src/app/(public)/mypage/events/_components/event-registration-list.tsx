"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stack } from "@/public/components/design-system/stack";
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
import { REGISTRATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { isValidRegistrationStatus } from "@/shared/lib/validations/enums/guards";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { getAppUrl } from "@/shared/lib/constants";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventRegistrationListItem {
  readonly id: string;
  readonly quantity: number;
  readonly status: string;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly location: string | null;
    readonly status: string;
  };
}

interface EventRegistrationListProps {
  readonly registrations: readonly EventRegistrationListItem[];
  readonly emptyMessage: string;
  readonly showBrowseCta?: boolean;
  readonly turnstileSiteKey: string | null;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type BadgeVariant = "default" | "success" | "warning" | "info";

const REGISTRATION_STATUS_VARIANTS: Record<RegistrationStatus, BadgeVariant> = {
  [RegistrationStatus.CONFIRMED]: "success",
  [RegistrationStatus.CANCELLED]: "default",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventRegistrationList({
  registrations,
  emptyMessage,
  showBrowseCta = false,
  turnstileSiteKey,
}: EventRegistrationListProps) {
  if (registrations.length === 0) {
    return (
      <div className="space-y-4 py-12 text-center md:py-16">
        <p className="text-muted-foreground">{emptyMessage}</p>
        {showBrowseCta && (
          <Button
            variant="editorial"
            size="sm"
            href="/events"
            className="w-full sm:w-auto"
          >
            イベントを探す
          </Button>
        )}
      </div>
    );
  }

  return (
    <Stack gap="md">
      {registrations.map((registration) => (
        <EventRegistrationCard
          key={registration.id}
          registration={registration}
          turnstileSiteKey={turnstileSiteKey}
        />
      ))}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function EventRegistrationCard({
  registration,
  turnstileSiteKey,
}: {
  readonly registration: EventRegistrationListItem;
  readonly turnstileSiteKey: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);
  const router = useRouter();

  const canCancel = registration.status === RegistrationStatus.CONFIRMED;

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
      } else {
        setCancelDialogOpen(false);
        router.refresh();
      }
    });
  };

  const status = isValidRegistrationStatus(registration.status)
    ? registration.status
    : null;
  const statusLabel = status
    ? REGISTRATION_STATUS_LABELS[status]
    : registration.status;
  const statusVariant: BadgeVariant = status
    ? REGISTRATION_STATUS_VARIANTS[status]
    : "default";

  return (
    <article
      aria-label={`${registration.event.title}の申込: ${statusLabel}`}
      className="border border-border p-4 sm:p-6"
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        {/* min-w-0 + break-words で長 title の overflow を防止し、
            Link 自体に min-h-11 を付けて 44px タップ標的を担保。 */}
        <Link
          href={`/events/${registration.event.slug}`}
          className="inline-flex min-h-11 min-w-0 items-center break-words text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-accent"
        >
          {registration.event.title}
        </Link>
        <Badge variant={statusVariant} className="shrink-0">
          {statusLabel}
        </Badge>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
        <div>
          <dt className="sr-only">日時</dt>
          <dd>
            {formatEventDateTimeRange(
              registration.event.startTime,
              registration.event.endTime,
            )}
          </dd>
        </div>
        {registration.event.location && (
          <div>
            <dt className="sr-only">場所</dt>
            <dd>{registration.event.location}</dd>
          </div>
        )}
        <div>
          <dt className="inline">参加人数: </dt>
          <dd className="inline">{registration.quantity}名</dd>
        </div>
      </dl>

      {registration.status === RegistrationStatus.CONFIRMED && (
        <div className="mt-4 border-t border-border pt-3">
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

      {canCancel && (
        <div className="mt-4 border-t border-border pt-3">
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
            <DialogContent>
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

              {/* JSX 順 = visual 順 (Dialog primitive 修正後)。
               *  mobile 縦並びで「閉じる」=上、「キャンセル」(destructive) = 下 (thumb-zone)。 */}
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
            </DialogContent>
          </Dialog>
        </div>
      )}
    </article>
  );
}
