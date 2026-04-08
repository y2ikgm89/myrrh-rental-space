"use client";

import { useState, useRef, useTransition } from "react";
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
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventRegistration {
  readonly id: string;
  readonly numberOfPeople: number;
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
  readonly registrations: readonly EventRegistration[];
  readonly turnstileSiteKey: string | null;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type BadgeVariant = "default" | "success" | "warning" | "info";

const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "申込済み",
  CANCELLED: "キャンセル済み",
};

const REGISTRATION_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  CONFIRMED: "success",
  CANCELLED: "default",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventRegistrationList({
  registrations,
  turnstileSiteKey,
}: EventRegistrationListProps) {
  if (registrations.length === 0) {
    return (
      <div className="py-16 md:py-24 text-center">
        <p className="text-sm text-muted-foreground">
          イベント申込がありません
        </p>
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
  readonly registration: EventRegistration;
  readonly turnstileSiteKey: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);
  const router = useRouter();

  const canCancel = registration.status === "CONFIRMED";

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

  const statusLabel =
    REGISTRATION_STATUS_LABELS[registration.status] ?? registration.status;
  const statusVariant =
    REGISTRATION_STATUS_VARIANTS[registration.status] ?? "default";

  return (
    <div className="border border-border p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
        <Link
          href={`/events/${registration.event.slug}`}
          className="text-foreground hover:text-foreground transition-colors"
        >
          {registration.event.title}
        </Link>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
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
          <dd className="inline">{registration.numberOfPeople}名</dd>
        </div>
      </dl>

      {error != null && (
        <div
          className="mt-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
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
                </DialogDescription>
              </DialogHeader>
              <TurnstileWidget
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
              />
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelDialogOpen(false)}
                  disabled={isPending}
                >
                  閉じる
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmCancel}
                  disabled={isPending}
                  className="bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
                >
                  {isPending ? "キャンセル中..." : "キャンセルする"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
