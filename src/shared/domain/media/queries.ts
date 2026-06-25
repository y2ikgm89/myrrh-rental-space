import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { parseStringArray } from "@/shared/lib/json-validators";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import type { MediaType, MediaUsage } from "@generated/prisma/enums";

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

export async function getMediaListQuery(
  filters: {
    type?: MediaType;
    usage?: MediaUsage;
    mimeType?: string;
    search?: string;
  } = {},
  pagination: { page: number; limit: number },
) {
  const { skip, take, page, limit } = paginate(pagination);

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
      take,
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
    totalPages: calcTotalPages(total, limit),
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
