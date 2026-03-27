import "server-only";

import { prisma } from "@/shared/db/prisma";

const reviewListSelect = {
  id: true,
  spaceId: true,
  rating: true,
  title: true,
  comment: true,
  isPublished: true,
  createdAt: true,
  space: { select: { id: true, name: true } },
  customer: { select: { id: true, lastName: true, firstName: true } },
  reservation: { select: { id: true } },
} as const;

type ReviewListRow = Awaited<
  ReturnType<
    typeof prisma.spaceReview.findMany<{ select: typeof reviewListSelect }>
  >
>[number];

function formatReviewRow(r: ReviewListRow) {
  return {
    id: r.id,
    spaceId: r.spaceId,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    isPublished: r.isPublished,
    createdAt: r.createdAt.toISOString(),
    space: r.space,
    customer: {
      id: r.customer.id,
      lastName: r.customer.lastName,
      firstName: r.customer.firstName,
    },
    reservationId: r.reservation.id,
  };
}

export async function getReviewsQuery(
  filters: {
    spaceId?: string;
    rating?: number;
    isPublished?: boolean | "ALL";
  } = {},
  pagination: {
    page?: number;
    limit?: number;
    sortBy?: "createdAt" | "rating";
    sortOrder?: "asc" | "desc";
  } = {},
) {
  const { spaceId, rating, isPublished } = filters;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;

  const where: {
    spaceId?: string;
    rating?: number;
    isPublished?: boolean;
  } = {};

  if (spaceId) {
    where.spaceId = spaceId;
  }

  if (rating !== undefined) {
    where.rating = rating;
  }

  if (isPublished !== undefined && isPublished !== "ALL") {
    where.isPublished = isPublished;
  }

  const [total, reviews] = await prisma.$transaction([
    prisma.spaceReview.count({ where }),
    prisma.spaceReview.findMany({
      where,
      select: reviewListSelect,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    reviews: reviews.map(formatReviewRow),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getReviewByIdQuery(id: string) {
  const review = await prisma.spaceReview.findUnique({
    where: { id },
    select: {
      ...reviewListSelect,
      updatedAt: true,
    },
  });

  if (!review) {
    return null;
  }

  return {
    ...formatReviewRow(review),
    updatedAt: review.updatedAt.toISOString(),
  };
}
