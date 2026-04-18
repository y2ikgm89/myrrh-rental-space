import "server-only";

import { prisma } from "@/shared/db/prisma";
import { EventStatus, RegistrationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";

export async function createEventRegistrationCommand(data: {
  eventId: string;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  numberOfPeople: number;
  customerId?: string | null;
}) {
  const event = await prisma.event.findFirst({
    where: {
      id: data.eventId,
      deletedAt: null,
      status: EventStatus.PUBLISHED,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      capacity: true,
      registrationOpen: true,
      _count: {
        select: {
          registrations: {
            where: { status: RegistrationStatus.CONFIRMED },
          },
        },
      },
    },
  });

  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
  if (!event.registrationOpen)
    throw new DomainError(
      "このイベントは申込受付を終了しています",
      "VALIDATION",
    );

  if (event.capacity != null) {
    const remaining = event.capacity - event._count.registrations;
    if (data.numberOfPeople > remaining) {
      throw new DomainError(
        remaining <= 0
          ? "このイベントは満員です"
          : `残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
        "VALIDATION",
      );
    }
  }

  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: data.eventId,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      note: data.note ?? null,
      numberOfPeople: data.numberOfPeople,
      customerId: data.customerId ?? null,
    },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      numberOfPeople: true,
      icsSequence: true,
    },
  });

  return { registration, event: { title: event.title, slug: event.slug } };
}

export async function cancelEventRegistrationCommand(
  registrationId: string,
  customerId?: string,
) {
  const registration = await prisma.eventRegistration.findFirst({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      event: { deletedAt: null },
      ...(customerId ? { customerId } : {}),
    },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      numberOfPeople: true,
      event: { select: { title: true, slug: true } },
    },
  });

  if (!registration) throw new DomainError("申込が見つかりません", "NOT_FOUND");

  const updated = await prisma.eventRegistration.update({
    where: { id: registrationId },
    data: {
      status: RegistrationStatus.CANCELLED,
      cancelledAt: new Date(),
      icsSequence: { increment: 1 },
    },
    select: { icsSequence: true },
  });

  return { ...registration, icsSequence: updated.icsSequence };
}
