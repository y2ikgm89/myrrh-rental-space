import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import {
  assertAllowedManagedGallery,
  assertAllowedManagedImageSourcesInJson,
  assertAllowedManagedImageUrl,
  assertAllowedManagedImageUrls,
} from "@/shared/domain/media/managed-image-assertions";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import {
  gallerySchema,
  type GalleryItem,
} from "@/shared/lib/validations/gallery";

type SpaceCommandInput = {
  slug: string;
  name: string;
  descriptionJson: Prisma.InputJsonValue;
  descriptionHtml: string;
  descriptionPlainText: string;
  addressDetail?: string | null | undefined;
  capacity: number;
  area?: number | null | undefined;
  hourlyPrice: number;
  dailyPrice?: number | null | undefined;
  mainImageUrl: string;
  gallery: readonly GalleryItem[];
  facilities: { name: string; iconName: string }[];
  isPublished: boolean;
  reviewsEnabled: boolean;
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
    capacity: input.capacity,
    area: input.area ?? null,
    hourlyPrice: input.hourlyPrice,
    dailyPrice: input.dailyPrice ?? null,
    mainImageUrl: input.mainImageUrl,
    gallery: asPrismaInputJsonValue(input.gallery, "gallery が不正です"),
    facilities: input.facilities,
    isPublished: input.isPublished,
    reviewsEnabled: input.reviewsEnabled,
    publishedAt,
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

function assertAllowedSpaceImages(input: {
  readonly descriptionJson: Prisma.InputJsonValue;
  readonly mainImageUrl: string;
  readonly gallery: readonly GalleryItem[];
  readonly ogpImageUrl?: string | null | undefined;
}): void {
  assertAllowedManagedImageSourcesInJson(
    "スペース本文画像",
    input.descriptionJson,
  );
  assertAllowedManagedImageUrls([
    { label: "スペースメイン画像", url: input.mainImageUrl },
    { label: "OGP画像", url: input.ogpImageUrl },
  ]);
  assertAllowedManagedGallery("スペースギャラリー画像", input.gallery);
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
    where: { id, isActive: true },
    select: { id: true, isPublished: true, publishedAt: true },
  });

  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  return space;
}

export async function createSpaceCommand(
  input: SpaceCommandInput,
): Promise<{ id: string; slug: string }> {
  assertAllowedSpaceImages(input);
  await ensureSlugAvailable(input.slug);
  await ensureAssignableLocation(input.locationId);
  await ensureAssignableCategory(input.categoryId);

  const space = await prisma.space.create({
    data: buildSpaceData(input, input.isPublished ? new Date() : null),
    select: { id: true, slug: true },
  });

  return space;
}

export async function updateSpaceCommand(
  id: string,
  input: SpaceCommandInput,
): Promise<{ id: string; slug: string; oldSlug: string }> {
  assertAllowedSpaceImages(input);
  // Validation queries can run outside the transaction (each is a single read).
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

  // Capture oldSlug + apply update atomically so a concurrent admin rename
  // can't slip in between the findUnique and the update.
  // Per CLAUDE.md: array form $transaction is banned; use interactive form.
  return prisma.$transaction(async (tx) => {
    const before = await tx.space.findUnique({
      where: { id, isActive: true },
      select: { slug: true },
    });
    if (!before) {
      throw new DomainError("スペースが見つかりません", "NOT_FOUND");
    }
    const row = await tx.space.update({
      where: { id, isActive: true },
      data: buildSpaceData(input, publishedAt),
      select: { id: true, slug: true },
    });
    return { id: row.id, slug: row.slug, oldSlug: before.slug };
  });
}

export async function updateSpacePublishedCommand(
  id: string,
  isPublished: boolean,
): Promise<{ id: string; slug: string; isPublished: boolean }> {
  await ensureSpaceExists(id);

  const row = await prisma.space.update({
    where: { id, isActive: true },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
    select: { id: true, slug: true },
  });

  return { id: row.id, slug: row.slug, isPublished };
}

export async function deleteSpaceCommand(
  id: string,
): Promise<{ id: string; slug: string }> {
  const space = await prisma.space.findUnique({
    where: { id, isActive: true },
    select: {
      id: true,
      slug: true,
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
    where: { id, isActive: true },
    data: {
      isActive: false,
      isPublished: false,
      publishedAt: null,
    },
  });

  return { id: space.id, slug: space.slug };
}

/**
 * 既存スペースを複製して新規 DRAFT スペースを作成する。
 *
 * - 本文・サムネイル・容量・料金・割引・税率・SEO/OGP は全てコピー
 * - `isPublished` は強制 `false`（DRAFT 化）、`publishedAt` は `null`
 * - `reviewsEnabled` も元レコードを継承
 * - 関連する予約・レビュー・イベント・iCal トークンは複製しない
 * - slug は `${original.slug}-copy` をベースに `ensureUniqueSlug` で衝突回避
 * - name は `${original.name}（コピー）` の慣例に従う（Event 複製と全角括弧で統一）
 * - 画像 URL（mainImageUrl / gallery）は元レコードの URL を参照共有
 *   （R2 オブジェクト複製は行わない。差し替えは管理者の編集操作）
 *
 * 同一実装が `events/commands.ts` の `duplicateEventCommand` にもある（YAGNI のため
 * 共通化していない。3 リソース目で `@/shared/lib/slug-validation` への抽出を検討）。
 */
export async function duplicateSpaceCommand(
  id: string,
): Promise<{ id: string; slug: string }> {
  const source = await prisma.space.findUnique({
    where: { id, isActive: true },
    select: {
      slug: true,
      name: true,
      descriptionJson: true,
      descriptionHtml: true,
      descriptionPlainText: true,
      addressDetail: true,
      capacity: true,
      area: true,
      hourlyPrice: true,
      dailyPrice: true,
      mainImageUrl: true,
      gallery: true,
      facilities: true,
      businessHours: true,
      reviewsEnabled: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
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
  const sourceGalleryResult = gallerySchema.safeParse(source.gallery);
  if (!sourceGalleryResult.success) {
    throw new DomainError("gallery が不正です", "VALIDATION");
  }
  const sourceGallery = sourceGalleryResult.data;
  assertAllowedManagedImageSourcesInJson(
    "スペース本文画像",
    source.descriptionJson,
  );
  assertAllowedManagedImageUrl("スペースメイン画像", source.mainImageUrl);
  assertAllowedManagedGallery("スペースギャラリー画像", sourceGallery);
  assertAllowedManagedImageUrl("OGP画像", source.ogpImageUrl);

  const created = await prisma.space.create({
    data: {
      slug,
      name: `${source.name}（コピー）`,
      descriptionJson: asPrismaInputJsonValue(
        source.descriptionJson,
        "descriptionJson が不正です",
      ),
      descriptionHtml: source.descriptionHtml,
      descriptionPlainText: source.descriptionPlainText,
      addressDetail: source.addressDetail,
      capacity: source.capacity,
      area: source.area,
      hourlyPrice: source.hourlyPrice,
      dailyPrice: source.dailyPrice,
      mainImageUrl: source.mainImageUrl,
      gallery: asPrismaInputJsonValue(sourceGallery, "gallery が不正です"),
      facilities: asPrismaInputJsonValue(
        source.facilities,
        "facilities が不正です",
      ),
      businessHours:
        source.businessHours === null
          ? Prisma.JsonNull
          : asPrismaInputJsonValue(
              source.businessHours,
              "businessHours が不正です",
            ),
      reviewsEnabled: source.reviewsEnabled,
      metaDescription: source.metaDescription,
      metaKeywords: source.metaKeywords,
      ogpTitle: source.ogpTitle,
      ogpDescription: source.ogpDescription,
      ogpImageUrl: source.ogpImageUrl,
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
