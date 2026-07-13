export type PublicEventSlotStatus =
  "available" | "sold-out" | "deadline-passed";

export type PublicEventScheduleMode = "SINGLE_OCCURRENCE" | "TIMED_ENTRY";

export type PublicEventSlotOption = {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly remaining: number;
  readonly status: PublicEventSlotStatus;
};

export type PublicEventRegistrationState =
  | {
      readonly kind: "open";
      readonly availableSlotCount: number;
      readonly remainingCapacity: number;
    }
  | { readonly kind: "waitlist-available" }
  | { readonly kind: "deadline-passed" }
  | { readonly kind: "closed" };

type DateLike = Date | string;

export type PublicEventSlotInventory = {
  readonly id: string;
  readonly startAt: DateLike;
  readonly endAt: DateLike;
  readonly capacity: number;
  readonly confirmedCount: number;
};

type BuildPublicEventSlotOptionsInput = {
  readonly slots: readonly PublicEventSlotInventory[];
  readonly registrationDeadline: DateLike | null;
  readonly now: DateLike;
};

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

function toIsoString(value: DateLike): string {
  return toDate(value).toISOString();
}

function getSlotStatus(params: {
  readonly remaining: number;
  readonly deadline: Date;
  readonly now: Date;
}): PublicEventSlotStatus {
  if (params.now.getTime() > params.deadline.getTime()) {
    return "deadline-passed";
  }
  return params.remaining <= 0 ? "sold-out" : "available";
}

export function buildPublicEventSlotOptions({
  slots,
  registrationDeadline,
  now,
}: BuildPublicEventSlotOptionsInput): PublicEventSlotOption[] {
  const nowDate = toDate(now);
  const globalDeadline =
    registrationDeadline !== null ? toDate(registrationDeadline) : null;

  return [...slots]
    .sort((a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime())
    .map((slot) => {
      const remaining = Math.max(0, slot.capacity - slot.confirmedCount);
      const deadline = globalDeadline ?? toDate(slot.startAt);
      return {
        id: slot.id,
        startTime: toIsoString(slot.startAt),
        endTime: toIsoString(slot.endAt),
        capacity: slot.capacity,
        confirmedCount: slot.confirmedCount,
        remaining,
        status: getSlotStatus({ remaining, deadline, now: nowDate }),
      };
    });
}

export function buildCurrentPublicEventSlotOptions(params: {
  readonly slots: readonly PublicEventSlotInventory[];
  readonly registrationDeadline: DateLike | null;
}): PublicEventSlotOption[] {
  return buildPublicEventSlotOptions({
    ...params,
    now: new Date(),
  });
}

export function derivePublicEventRegistrationState(params: {
  readonly eventStatus: string;
  readonly registrationOpen: boolean;
  readonly slots: readonly PublicEventSlotOption[];
}): PublicEventRegistrationState {
  if (
    params.eventStatus !== "PUBLISHED" ||
    !params.registrationOpen ||
    params.slots.length === 0
  ) {
    return { kind: "closed" };
  }

  const availableSlots = params.slots.filter(
    (slot) => slot.status === "available",
  );
  if (availableSlots.length > 0) {
    return {
      kind: "open",
      availableSlotCount: availableSlots.length,
      remainingCapacity: availableSlots.reduce(
        (sum, slot) => sum + slot.remaining,
        0,
      ),
    };
  }

  const registrationWindowSlots = params.slots.filter(
    (slot) => slot.status !== "deadline-passed",
  );
  if (
    registrationWindowSlots.length > 0 &&
    registrationWindowSlots.every((slot) => slot.status === "sold-out")
  ) {
    return { kind: "waitlist-available" };
  }

  if (params.slots.every((slot) => slot.status === "deadline-passed")) {
    return { kind: "deadline-passed" };
  }

  return { kind: "closed" };
}

export function shouldExposePublicEventSlotSelector(params: {
  readonly scheduleMode: PublicEventScheduleMode;
  readonly slots: readonly PublicEventSlotOption[];
}): boolean {
  return params.scheduleMode === "TIMED_ENTRY" && params.slots.length > 1;
}
