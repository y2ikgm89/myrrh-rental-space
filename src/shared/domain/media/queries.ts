import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { parseStringArray } from "@/shared/lib/json-validators";
import type { MediaType, MediaUsage } from "@generated/prisma/enums";
import type { PageBuilderResolvedMedia } from "@/shared/lib/page-builder/media";

function transformMedia(media: {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  type: string;
  usage: string;
  alt: string | null;
  title: string | null;
  description: string | null;
  tags: unknown;
  createdAt: Date;
  updatedAt: Date;
  uploader: { id: string; name: string } | null;
}) {
  return {
    id: media.id,
    filename: media.filename,
    url: media.url,
    mimeType: media.mimeType,
    size: media.size,
    width: media.width,
    height: media.height,
    type: media.type,
    usage: media.usage,
    alt: media.alt,
    title: media.title,
    description: media.description,
    tags: parseStringArray(media.tags),
    createdAt: media.createdAt.toISOString(),
    updatedAt: media.updatedAt.toISOString(),
    uploader: media.uploader
      ? { id: media.uploader.id, name: media.uploader.name }
      : null,
  };
}

function transformPageBuilderMedia(media: {
  id: string;
  url: string;
  alt: string | null;
  filename: string;
  width: number | null;
  height: number | null;
}): PageBuilderResolvedMedia {
  return {
    id: media.id,
    url: media.url,
    alt: media.alt,
    filename: media.filename,
    width: media.width,
    height: media.height,
  };
}

export async function getMediaListQuery(
  filters: {
    type?: MediaType;
    usage?: MediaUsage;
    mimeType?: string;
    search?: string;
  } = {},
  pagination: { page: number; limit: number },
) {
  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  const where: Prisma.MediaWhereInput = {
    isActive: true,
  };

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.usage) {
    where.usage = filters.usage;
  }

  if (filters.mimeType) {
    where.mimeType = { contains: filters.mimeType };
  }

  if (filters.search) {
    where.OR = [
      {
        filename: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        title: { contains: filters.search, mode: "insensitive" },
      },
      {
        alt: { contains: filters.search, mode: "insensitive" },
      },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        url: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        type: true,
        usage: true,
        alt: true,
        title: true,
        description: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        uploader: { select: { id: true, name: true } },
      },
    }),
    prisma.media.count({ where }),
  ]);

  return {
    items: items.map(transformMedia),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getMediaByIdQuery(id: string) {
  const media = await prisma.media.findUnique({
    where: { id, isActive: true },
    select: {
      id: true,
      filename: true,
      url: true,
      mimeType: true,
      size: true,
      width: true,
      height: true,
      type: true,
      usage: true,
      alt: true,
      title: true,
      description: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      uploader: { select: { id: true, name: true } },
    },
  });

  return media ? transformMedia(media) : null;
}

export async function getMediaByIdsQuery(
  ids: readonly string[],
): Promise<PageBuilderResolvedMedia[]> {
  if (ids.length === 0) {
    return [];
  }

  const media = await prisma.media.findMany({
    where: {
      id: { in: [...ids] },
      isActive: true,
      type: "IMAGE",
    },
    select: {
      id: true,
      url: true,
      alt: true,
      filename: true,
      width: true,
      height: true,
    },
  });

  return media.map(transformPageBuilderMedia);
}
