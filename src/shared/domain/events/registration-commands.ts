import "server-only";

import { prisma } from "@/shared/db/prisma";
import { EventStatus, RegistrationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";

export async function createEventRegistrationCommand(data: {
  eventId: string;
  ticketId: string;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  quantity: number;
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
      registrationDeadline: true,
      startTime: true,
    },
  });

  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
  if (!event.registrationOpen)
    throw new DomainError(
      "このイベントは申込受付を終了しています",
      "VALIDATION",
    );

  // 申込締切：未設定なら開始時刻、設定があればその時刻まで受付
  const deadline = event.registrationDeadline ?? event.startTime;
  if (Date.now() > deadline.getTime())
    throw new DomainError(
      "申込締切を過ぎたため受け付けできません",
      "VALIDATION",
    );

  // チケットがイベントに属するか確認（per-ticket capacity も取得）
  const ticket = await prisma.eventTicket.findFirst({
    where: { id: data.ticketId, eventId: data.eventId, isAvailable: true },
    select: { id: true, name: true, capacity: true },
  });
  if (!ticket)
    throw new DomainError(
      "指定されたチケット種別が見つかりません",
      "NOT_FOUND",
    );

  // 残枠集計は CONFIRMED 申込の quantity 合計で判定（公開ページ表示と同一基準）
  const [eventConfirmed, ticketConfirmed] = await Promise.all([
    event.capacity != null
      ? prisma.eventRegistration.aggregate({
          where: { eventId: event.id, status: RegistrationStatus.CONFIRMED },
          _sum: { quantity: true },
        })
      : Promise.resolve(null),
    ticket.capacity != null
      ? prisma.eventRegistration.aggregate({
          where: {
            eventId: event.id,
            ticketId: ticket.id,
            status: RegistrationStatus.CONFIRMED,
          },
          _sum: { quantity: true },
        })
      : Promise.resolve(null),
  ]);

  if (event.capacity != null && eventConfirmed) {
    const remaining = event.capacity - (eventConfirmed._sum.quantity ?? 0);
    if (data.quantity > remaining) {
      throw new DomainError(
        remaining <= 0
          ? "このイベントは満員です"
          : `残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
        "VALIDATION",
      );
    }
  }

  if (ticket.capacity != null && ticketConfirmed) {
    const remaining = ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
    if (data.quantity > remaining) {
      throw new DomainError(
        remaining <= 0
          ? `「${ticket.name}」は満員です`
          : `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
        "VALIDATION",
      );
    }
  }

  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: data.eventId,
      ticketId: data.ticketId,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      note: data.note ?? null,
      quantity: data.quantity,
      customerId: data.customerId ?? null,
    },
    select: {
      id: true,
      eventId: true,
      ticketId: true,
      name: true,
      email: true,
      quantity: true,
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
      quantity: true,
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
