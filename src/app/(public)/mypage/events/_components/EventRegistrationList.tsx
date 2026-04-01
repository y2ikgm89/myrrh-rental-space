"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stack } from "@/public/components/design-system/stack";
import { Badge } from "@/public/components/design-system/badge";
import { cancelEventRegistration } from "@/public/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatEventDateTimeRange } from "@/public/lib/format-event-date";

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
}: EventRegistrationListProps) {
  if (registrations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 md:p-12 text-center">
        <p className="text-muted-foreground">イベント申込がありません</p>
      </div>
    );
  }

  return (
    <Stack gap="md">
      {registrations.map((registration) => (
        <EventRegistrationCard
          key={registration.id}
          registration={registration}
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
}: {
  readonly registration: EventRegistration;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canCancel = registration.status === "CONFIRMED";

  const handleCancel = () => {
    if (!confirm("この申込をキャンセルしますか？")) return;

    startTransition(async () => {
      const result = await cancelEventRegistration(registration.id);
      if (isMutationError(result)) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  };

  const statusLabel =
    REGISTRATION_STATUS_LABELS[registration.status] ?? registration.status;
  const statusVariant =
    REGISTRATION_STATUS_VARIANTS[registration.status] ?? "default";

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
        <Link
          href={`/events/${registration.event.slug}`}
          className="text-foreground hover:text-primary transition-colors font-medium"
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

      {canCancel && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
          >
            {isPending ? "キャンセル中..." : "申込をキャンセル"}
          </button>
        </div>
      )}
    </div>
  );
}
