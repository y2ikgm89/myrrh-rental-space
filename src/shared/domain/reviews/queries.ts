import "server-only";

import { prisma } from "@/shared/db/prisma";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import type { Prisma } from "@generated/prisma/client";

const reviewListSelect = {
  id: true,
  spaceId: true,
  rating: true,
  title: true,
  comment: true,
  isPublished: true,
  replyBody: true,
  repliedAt: true,
  repliedBy: { select: { id: true, name: true } },
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
    replyBody: r.replyBody,
    repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
    repliedByUserName: r.repliedBy?.name ?? null,
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
    search?: string;
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
  const { search, spaceId, rating, isPublished } = filters;
  const { sortBy = "createdAt", sortOrder = "desc" } = pagination;
  const { skip, take, page, limit } = paginate(pagination);

  const conditions: Prisma.SpaceReviewWhereInput[] = [];

  if (spaceId) {
    conditions.push({ spaceId });
  }

  if (rating !== undefined) {
    conditions.push({ rating });
  }

  if (isPublished !== undefined && isPublished !== "ALL") {
    conditions.push({ isPublished });
  }

  if (search) {
    conditions.push({
      OR: [
        { space: { name: { contains: search, mode: "insensitive" } } },
        {
          customer: {
            lastName: { contains: search, mode: "insensitive" },
          },
        },
        {
          customer: {
            firstName: { contains: search, mode: "insensitive" },
          },
        },
        { title: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const where: Prisma.SpaceReviewWhereInput =
    conditions.length > 0 ? { AND: conditions } : {};

  const [total, reviews] = await Promise.all([
    prisma.spaceReview.count({ where }),
    prisma.spaceReview.findMany({
      where,
      select: reviewListSelect,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take,
    }),
  ]);

  return {
    reviews: reviews.map(formatReviewRow),
    total,
    page,
    limit,
    totalPages: calcTotalPages(total, limit),
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
