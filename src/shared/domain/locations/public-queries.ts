import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { toPlainArray } from "@/shared/lib/serialize";

export type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string;
};

export type LocationWithSpaces = {
  id: string;
  name: string;
  address: string;
  imageUrl: string;
  spaces: SpaceOption[];
};

/**
 * 公開済み Location と配下の公開済み Space を取得（予約フォーム用）
 */
export async function getPublishedLocationsWithSpaces(): Promise<
  LocationWithSpaces[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const locations = await prisma.location.findMany({
    where: { isPublished: true, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      imageUrl: true,
      spaces: {
        where: { isPublished: true, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          capacity: true,
          hourlyPrice: true,
          mainImageUrl: true,
        },
      },
    },
  });

  return toPlainArray(
    locations
      .filter((l) => l.spaces.length > 0)
      .map((l) => ({
        ...l,
        spaces: l.spaces.map((s) => ({
          ...s,
          hourlyPrice: Number(s.hourlyPrice),
        })),
      })),
  );
}
