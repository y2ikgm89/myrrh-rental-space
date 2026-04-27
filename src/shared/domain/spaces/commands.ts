import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";

type SpaceCommandInput = {
  slug: string;
  name: string;
  descriptionJson: Prisma.InputJsonValue;
  descriptionHtml: string;
  descriptionPlainText: string;
  addressDetail?: string | null | undefined;
  access?: string | null | undefined;
  capacity: number;
  area?: number | null | undefined;
  hourlyPrice: number;
  dailyPrice?: number | null | undefined;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
  isPublished: boolean;
  reviewsEnabled: boolean;
  termsId?: string | null | undefined;
  locationId: string;
  categoryId?: string | null | undefined;
  discountType?: DiscountType | null | undefined;
  discountValue?: number | null | undefined;
  durationDiscountOverride?: DurationDiscountOverride | null | undefined;
  taxRateType?: TaxRateType | null | undefined;
  metaDescription?: string | null | undefined;
  metaKeywords?: string | null | undefined;
  ogpTitle?: string | null | undefined;
  ogpDescription?: string | null | undefined;
  ogpImageUrl?: string | null | undefined;
};

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return value;
}

function buildSpaceData(input: SpaceCommandInput, publishedAt: Date | null) {
  return {
    slug: input.slug,
    name: input.name,
    descriptionJson: input.descriptionJson,
    descriptionHtml: input.descriptionHtml,
    descriptionPlainText: input.descriptionPlainText,
    addressDetail: normalizeNullableString(input.addressDetail),
    access: normalizeNullableString(input.access),
    capacity: input.capacity,
    area: input.area ?? null,
    hourlyPrice: input.hourlyPrice,
    dailyPrice: input.dailyPrice ?? null,
    mainImageUrl: input.mainImageUrl,
    imageUrls: input.imageUrls,
    facilities: input.facilities,
    isPublished: input.isPublished,
    reviewsEnabled: input.reviewsEnabled,
    publishedAt,
    termsId: input.termsId ?? null,
    locationId: input.locationId,
    categoryId: input.categoryId ?? null,
    discountType: input.discountType ?? DiscountType.none,
    discountValue: input.discountValue ?? null,
    durationDiscountOverride:
      input.durationDiscountOverride ?? DurationDiscountOverride.inherit,
    taxRateType: input.taxRateType ?? TaxRateType.standard,
    metaDescription: normalizeNullableString(input.metaDescription),
    metaKeywords: normalizeNullableString(input.metaKeywords),
    ogpTitle: normalizeNullableString(input.ogpTitle),
    ogpDescription: normalizeNullableString(input.ogpDescription),
    ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
  };
}

async function ensureSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "space",
    currentId,
  });

  if (!slugCheck.available) {
    throw new DomainError(getSlugErrorMessage(slugCheck.reason), "CONFLICT");
  }
}

async function ensureAssignableLocation(locationId: string): Promise<void> {
  const location = await prisma.location.findFirst({
    where: { id: locationId, isActive: true },
    select: { id: true },
  });
  if (!location) {
    throw new DomainError("拠点が見つからないか、無効です", "VALIDATION");
  }
}

async function ensureAssignableCategory(
  categoryId: string | null | undefined,
): Promise<void> {
  if (categoryId === null || categoryId === undefined) {
    return;
  }
  const category = await prisma.spaceCategory.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });
  if (!category) {
    throw new DomainError("カテゴリーが見つからないか、無効です", "VALIDATION");
  }
}

async function ensureSpaceExists(id: string) {
  const space = await prisma.space.findUnique({
    where: { id },
    select: { id: true, isPublished: true, publishedAt: true },
  });

  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  return space;
}

export async function createSpaceCommand(
  input: SpaceCommandInput,
): Promise<{ id: string }> {
  await ensureSlugAvailable(input.slug);
  await ensureAssignableLocation(input.locationId);
  await ensureAssignableCategory(input.categoryId);

  const space = await prisma.space.create({
    data: buildSpaceData(input, input.isPublished ? new Date() : null),
    select: { id: true },
  });

  return space;
}

export async function updateSpaceCommand(
  id: string,
  input: SpaceCommandInput,
): Promise<void> {
  const existingSpace = await ensureSpaceExists(id);
  await ensureAssignableLocation(input.locationId);
  await ensureAssignableCategory(input.categoryId);
  await ensureSlugAvailable(input.slug, id);

  let publishedAt = existingSpace.publishedAt;
  if (input.isPublished && !existingSpace.isPublished) {
    publishedAt = new Date();
  } else if (!input.isPublished) {
    publishedAt = null;
  }

  await prisma.space.update({
    where: { id },
    data: buildSpaceData(input, publishedAt),
  });
}

export async function updateSpacePublishCommand(
  id: string,
  isPublished: boolean,
): Promise<void> {
  await ensureSpaceExists(id);

  await prisma.space.update({
    where: { id },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });
}

export async function deleteSpaceCommand(id: string): Promise<void> {
  const space = await prisma.space.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: {
            where: {
              status: { in: [...ACTIVE_RESERVATION_STATUSES] },
            },
          },
        },
      },
    },
  });

  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  if (space._count.reservations > 0) {
    throw new DomainError("有効な予約があるため削除できません", "VALIDATION");
  }

  await prisma.space.update({
    where: { id },
    data: {
      isActive: false,
      isPublished: false,
    },
  });
}

export async function toggleSpacePublishedCommand(
  id: string,
): Promise<{ isPublished: boolean }> {
  const space = await prisma.space.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  });

  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  const isPublished = !space.isPublished;

  await prisma.space.update({
    where: { id },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { isPublished };
}

/**
 * 既存スペースを複製して新規 DRAFT スペースを作成する。
 *
 * - 本文・サムネイル・容量・料金・割引・税率・SEO/OGP は全てコピー
 * - `isPublished` は強制 `false`（DRAFT 化）、`publishedAt` は `null`
 * - `reviewsEnabled` も元レコードを継承
 * - 関連する予約・レビュー・イベント・iCal トークンは複製しない
 * - slug は `${original.slug}-copy` をベースに `ensureUniqueSlug` で衝突回避
 * - name は `${original.name}(コピー)` の慣例に従う
 * - 画像 URL（mainImageUrl / imageUrls）は元レコードの URL を参照共有
 *   （R2 オブジェクト複製は行わない。差し替えは管理者の編集操作）
 *
 * 同一実装が `events/commands.ts` の `duplicateEventCommand` にもある（YAGNI のため
 * 共通化していない。3 リソース目で `@/shared/lib/slug-validation` への抽出を検討）。
 */
export async function duplicateSpaceCommand(
  id: string,
): Promise<{ id: string; slug: string }> {
  const source = await prisma.space.findUnique({
    where: { id },
    select: {
      slug: true,
      name: true,
      descriptionJson: true,
      descriptionHtml: true,
      descriptionPlainText: true,
      addressDetail: true,
      access: true,
      capacity: true,
      area: true,
      hourlyPrice: true,
      dailyPrice: true,
      mainImageUrl: true,
      imageUrls: true,
      facilities: true,
      businessHours: true,
      reviewsEnabled: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      termsId: true,
      discountType: true,
      discountValue: true,
      durationDiscountOverride: true,
      taxRateType: true,
      locationId: true,
      categoryId: true,
    },
  });
  if (!source) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  const slug = await ensureUniqueSlug(`${source.slug}-copy`);

  const created = await prisma.space.create({
    data: {
      slug,
      name: `${source.name}(コピー)`,
      descriptionJson: source.descriptionJson as Prisma.InputJsonValue,
      descriptionHtml: source.descriptionHtml,
      descriptionPlainText: source.descriptionPlainText,
      addressDetail: source.addressDetail,
      access: source.access,
      capacity: source.capacity,
      area: source.area,
      hourlyPrice: source.hourlyPrice,
      dailyPrice: source.dailyPrice,
      mainImageUrl: source.mainImageUrl,
      imageUrls: source.imageUrls as Prisma.InputJsonValue,
      facilities: source.facilities as Prisma.InputJsonValue,
      businessHours:
        source.businessHours === null
          ? Prisma.JsonNull
          : (source.businessHours as Prisma.InputJsonValue),
      reviewsEnabled: source.reviewsEnabled,
      metaDescription: source.metaDescription,
      metaKeywords: source.metaKeywords,
      ogpTitle: source.ogpTitle,
      ogpDescription: source.ogpDescription,
      ogpImageUrl: source.ogpImageUrl,
      termsId: source.termsId,
      discountType: source.discountType,
      discountValue: source.discountValue,
      durationDiscountOverride: source.durationDiscountOverride,
      taxRateType: source.taxRateType,
      locationId: source.locationId,
      categoryId: source.categoryId,
      isPublished: false,
      publishedAt: null,
    },
    select: { id: true, slug: true },
  });

  return created;
}

/**
 * `slug` が空いていればそのまま返し、衝突したら `${slug}-2`, `${slug}-3` ...
 * の最小未使用番号を返す（WordPress / Ghost / Notion 互換のインクリメンタル方式）。
 *
 * deterministic な番号付けにより、複製スペースの URL が「-copy」「-copy-2」
 * のように人間に予測可能な並びになる。
 *
 * 同一ロジックが `events/commands.ts` にもある（YAGNI のため共通化していない）。
 */
async function ensureUniqueSlug(slug: string): Promise<string> {
  const existing = await prisma.space.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!existing) return slug;

  const siblings = await prisma.space.findMany({
    where: { slug: { startsWith: `${slug}-` } },
    select: { slug: true },
  });

  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-(\\d+)$`);
  const used = new Set<number>();
  for (const s of siblings) {
    const match = s.slug.match(pattern);
    if (match?.[1]) used.add(Number(match[1]));
  }

  let n = 2;
  while (used.has(n)) n++;
  return `${slug}-${n}`;
}
