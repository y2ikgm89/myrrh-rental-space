import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { ReservationStatus } from "@generated/prisma/enums";

type CreateReviewInput = {
  customerId: string;
  reservationId: string;
  rating: number;
  title: string | null;
  comment: string | null;
};

export async function createReviewCommand(input: CreateReviewInput) {
  // Global gate: featureModules.reviews（依存元 spaces 含む）で OFF なら拒否。
  if (!(await isFeatureEnabled("reviews"))) {
    throw new DomainError(
      "レビュー機能は現在サイト全体で無効化されています",
      "VALIDATION",
    );
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      spaceId: true,
      status: true,
      space: { select: { slug: true, reviewsEnabled: true } },
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

  if (!reservation.space.reviewsEnabled) {
    throw new DomainError(
      "このスペースではレビュー投稿が無効化されています",
      "VALIDATION",
    );
  }

  if (reservation.review) {
    throw new DomainError(
      "この予約には既にレビューが投稿されています",
      "CONFLICT",
    );
  }

  const created = await prisma.spaceReview.create({
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

  return {
    id: created.id,
    spaceId: created.spaceId,
    spaceSlug: reservation.space.slug,
  };
}

export async function toggleReviewPublishedCommand(
  id: string,
  isPublished: boolean,
): Promise<{ spaceId: string; spaceSlug: string }> {
  const review = await prisma.spaceReview.findUnique({
    where: { id },
    select: {
      id: true,
      spaceId: true,
      space: { select: { slug: true } },
    },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.update({
    where: { id },
    data: { isPublished },
  });

  return { spaceId: review.spaceId, spaceSlug: review.space.slug };
}

export async function deleteReviewCommand(id: string) {
  const review = await prisma.spaceReview.findUnique({
    where: { id },
    select: {
      id: true,
      spaceId: true,
      space: { select: { slug: true } },
    },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.delete({
    where: { id },
  });

  return { spaceId: review.spaceId, spaceSlug: review.space.slug };
}

type ReplyToReviewInput = {
  reviewId: string;
  replyBody: string;
  adminUserId: string;
};

export type ReviewReplyEmailContext = {
  readonly customerEmail: string;
  readonly customerName: string;
  readonly spaceName: string;
  readonly rating: number;
  readonly title: string | null;
  readonly comment: string | null;
  readonly replyBody: string;
};

export async function replyToReviewCommand(input: ReplyToReviewInput): Promise<{
  spaceId: string;
  spaceSlug: string;
  emailContext: ReviewReplyEmailContext | null;
}> {
  const review = await prisma.spaceReview.findUnique({
    where: { id: input.reviewId },
    select: {
      id: true,
      spaceId: true,
      rating: true,
      title: true,
      comment: true,
      customer: { select: { email: true, lastName: true, firstName: true } },
      space: { select: { name: true, slug: true } },
    },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.update({
    where: { id: input.reviewId },
    data: {
      replyBody: input.replyBody,
      repliedAt: new Date(),
      repliedById: input.adminUserId,
    },
  });

  const customerEmail = review.customer.email;
  let emailContext: ReviewReplyEmailContext | null = null;
  if (customerEmail) {
    const fullName =
      `${review.customer.lastName} ${review.customer.firstName}`.trim();
    emailContext = {
      customerEmail,
      customerName: fullName || "お客様",
      spaceName: review.space.name,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      replyBody: input.replyBody,
    };
  }

  return {
    spaceId: review.spaceId,
    spaceSlug: review.space.slug,
    emailContext,
  };
}

export async function deleteReviewReplyCommand(
  id: string,
): Promise<{ spaceId: string; spaceSlug: string }> {
  const review = await prisma.spaceReview.findUnique({
    where: { id },
    select: {
      id: true,
      spaceId: true,
      space: { select: { slug: true } },
    },
  });

  if (!review) {
    throw new DomainError("レビューが見つかりません", "NOT_FOUND");
  }

  await prisma.spaceReview.update({
    where: { id },
    data: {
      replyBody: null,
      repliedAt: null,
      repliedById: null,
    },
  });

  return { spaceId: review.spaceId, spaceSlug: review.space.slug };
}
