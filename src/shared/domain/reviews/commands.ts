import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { ReservationStatus } from "@/shared/db/enums";

type CreateReviewInput = {
  customerId: string;
  reservationId: string;
  rating: number;
  title: string | null;
  comment: string | null;
};

export async function createReviewCommand(input: CreateReviewInput) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    select: {
      id: true,
      customerId: true,
      spaceId: true,
      status: true,
      review: { select: { id: true } },
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  if (reservation.customerId !== input.customerId) {
    throw new DomainError(
      "この予約にレビューを投稿する権限がありません",
      "UNAUTHORIZED",
    );
  }

  if (reservation.status !== ReservationStatus.COMPLETED) {
    throw new DomainError(
      "完了済みの予約のみレビューを投稿できます",
      "VALIDATION",
    );
  }

  if (reservation.review) {
    throw new DomainError(
      "この予約には既にレビューが投稿されています",
      "CONFLICT",
    );
  }

  return prisma.spaceReview.create({
    data: {
      spaceId: reservation.spaceId,
      customerId: input.customerId,
      reservationId: input.reservationId,
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
    },
    select: { id: true, spaceId: true },
  });
}

export async function toggleReviewPublishedCommand(
  id: string,
  isPublished: boolean,
) {
  const review = await prisma.spaceReview.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.update({
    where: { id },
    data: { isPublished },
  });
}

export async function deleteReviewCommand(id: string) {
  const review = await prisma.spaceReview.findUnique({
    where: { id },
    select: { id: true, spaceId: true },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.delete({
    where: { id },
  });

  return { spaceId: review.spaceId };
}
