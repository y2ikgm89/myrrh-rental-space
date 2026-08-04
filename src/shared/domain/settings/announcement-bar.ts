import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  isDisplayPeriodOrderValid,
  parseDateTimeLocalAsJst,
} from "@/shared/lib/date-format";
import { optionalHttpOrInternalHrefSchema } from "@/shared/lib/url/safe-href";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import {
  createSpanArraySchema,
  portableTextSpanSchema,
} from "@/shared/lib/portable-text/schema";
import {
  spansToPlainText,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";

/**
 * DB の Json 列から読み出した message を防御的に PortableTextSpan[] に narrow。
 * 不正形式（手動編集 / 旧データ）は空配列にフォールバック。
 */
export function parseAnnouncementBarMessage(
  value: unknown,
): PortableTextSpan[] {
  const result = z.array(portableTextSpanSchema).safeParse(value);
  return result.success ? result.data : [];
}

export type AnnouncementBarData = {
  id: string;
  message: PortableTextSpan[];
  linkUrl: string | null;
  linkText: string | null;
  bgColor: string | null;
  textColor: string | null;
  isActive: boolean;
  displayOrder: number;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AnnouncementBarCarouselSettings = {
  announcementBarAnimation: AnnouncementBarAnimation;
  announcementBarDuration: number;
  announcementBarAutoPlay: boolean;
  announcementBarPauseOnHover: boolean;
  announcementBarShowArrows: boolean;
  announcementBarShowIndicator: boolean;
  announcementBarDesignStyle: AnnouncementBarDesignStyle;
  announcementBarBgColor: string | null;
  announcementBarTextColor: string | null;
  announcementBarStripeColor: string | null;
  announcementBarStripeAnimation: boolean;
  announcementBarGradientAnimation: boolean;
  announcementBarGlassAnimation: boolean;
  announcementBarSticky: boolean;
};

export const announcementBarCarouselSettingsSchema = z.object({
  announcementBarAnimation: z.enum(AnnouncementBarAnimation),
  announcementBarDuration: z.number().int().min(1000).max(30000),
  announcementBarAutoPlay: z.boolean(),
  announcementBarPauseOnHover: z.boolean(),
  announcementBarShowArrows: z.boolean(),
  announcementBarShowIndicator: z.boolean(),
  announcementBarDesignStyle: z.enum(AnnouncementBarDesignStyle),
  announcementBarBgColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarTextColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarStripeColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarStripeAnimation: z.boolean(),
  announcementBarGradientAnimation: z.boolean(),
  announcementBarGlassAnimation: z.boolean(),
  announcementBarSticky: z.boolean(),
});

export type AnnouncementBarCarouselSettingsInput = z.infer<
  typeof announcementBarCarouselSettingsSchema
>;

const announcementBarSelect = {
  id: true,
  message: true,
  linkUrl: true,
  linkText: true,
  bgColor: true,
  textColor: true,
  isActive: true,
  displayOrder: true,
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AnnouncementBarSelect;

type AnnouncementBarSelectRow = Prisma.AnnouncementBarGetPayload<{
  select: typeof announcementBarSelect;
}>;

function shapeAnnouncementBarRow(
  row: AnnouncementBarSelectRow,
): AnnouncementBarData {
  return {
    id: row.id,
    message: parseAnnouncementBarMessage(row.message),
    linkUrl: row.linkUrl,
    linkText: row.linkText,
    bgColor: row.bgColor,
    textColor: row.textColor,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    startAt: row.startAt,
    endAt: row.endAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const carouselDbSelect = {
  animation: true,
  duration: true,
  autoPlay: true,
  pauseOnHover: true,
  showArrows: true,
  showIndicator: true,
  designStyle: true,
  bgColor: true,
  textColor: true,
  stripeColor: true,
  stripeAnimation: true,
  gradientAnimation: true,
  glassAnimation: true,
  sticky: true,
} as const satisfies Prisma.SettingsAnnouncementCarouselSelect;

type CarouselDbRow = Prisma.SettingsAnnouncementCarouselGetPayload<{
  select: typeof carouselDbSelect;
}>;

function mapCarouselRowToDto(
  row: CarouselDbRow,
): AnnouncementBarCarouselSettings {
  return {
    announcementBarAnimation: row.animation,
    announcementBarDuration: row.duration,
    announcementBarAutoPlay: row.autoPlay,
    announcementBarPauseOnHover: row.pauseOnHover,
    announcementBarShowArrows: row.showArrows,
    announcementBarShowIndicator: row.showIndicator,
    announcementBarDesignStyle: row.designStyle,
    announcementBarBgColor: row.bgColor,
    announcementBarTextColor: row.textColor,
    announcementBarStripeColor: row.stripeColor,
    announcementBarStripeAnimation: row.stripeAnimation,
    announcementBarGradientAnimation: row.gradientAnimation,
    announcementBarGlassAnimation: row.glassAnimation,
    announcementBarSticky: row.sticky,
  };
}

function mapCarouselDtoToDb(data: AnnouncementBarCarouselSettingsInput) {
  return {
    animation: data.announcementBarAnimation,
    duration: data.announcementBarDuration,
    autoPlay: data.announcementBarAutoPlay,
    pauseOnHover: data.announcementBarPauseOnHover,
    showArrows: data.announcementBarShowArrows,
    showIndicator: data.announcementBarShowIndicator,
    designStyle: data.announcementBarDesignStyle,
    bgColor: data.announcementBarBgColor,
    textColor: data.announcementBarTextColor,
    stripeColor: data.announcementBarStripeColor,
    stripeAnimation: data.announcementBarStripeAnimation,
    gradientAnimation: data.announcementBarGradientAnimation,
    glassAnimation: data.announcementBarGlassAnimation,
    sticky: data.announcementBarSticky,
  };
}

export async function ensureSettingsAnnouncementCarousel() {
  return prisma.settingsAnnouncementCarousel.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

const defaultCarouselSettings: AnnouncementBarCarouselSettings = {
  announcementBarAnimation: AnnouncementBarAnimation.FADE,
  announcementBarDuration: 5000,
  announcementBarAutoPlay: true,
  announcementBarPauseOnHover: true,
  announcementBarShowArrows: true,
  announcementBarShowIndicator: true,
  announcementBarDesignStyle: AnnouncementBarDesignStyle.SOLID,
  announcementBarBgColor: null,
  announcementBarTextColor: null,
  announcementBarStripeColor: null,
  announcementBarStripeAnimation: false,
  announcementBarGradientAnimation: false,
  announcementBarGlassAnimation: false,
  announcementBarSticky: false,
};

export const announcementBarInputSchema = z
  .strictObject({
    /**
     * Sanity Portable Text 互換の Span 配列（テキスト + アイコン混在、最大 30 span）。
     * 空配列 / 純アイコン構成は UI 層が許容するが、ここではプレーン文字列ベースで
     * 1 文字以上必須を契約（icon-only モード = メッセージ意味不在は NN/g 準拠で拒否）。
     */
    message: createSpanArraySchema({ maxSpans: 30 })
      .refine((spans) => spansToPlainText(spans).trim().length > 0, {
        error: "メッセージにテキストを 1 文字以上含めてください",
      })
      .refine((spans) => spansToPlainText(spans).length <= 200, {
        error: "メッセージは200文字以内で入力してください",
      }),
    linkUrl: optionalHttpOrInternalHrefSchema,
    linkText: z
      .string()
      .trim()
      .max(50, { error: "リンクテキストは50文字以内" })
      .nullable()
      .optional(),
    bgColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, { error: "有効な色コードを入力してください" })
      .transform((value) => value.toLowerCase())
      .or(z.literal(""))
      .nullable()
      .optional(),
    textColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, { error: "有効な色コードを入力してください" })
      .transform((value) => value.toLowerCase())
      .or(z.literal(""))
      .nullable()
      .optional(),
    isActive: z.boolean().default(true),
    // `<input type="datetime-local">` の値（"YYYY-MM-DDTHH:mm" / "...:ss"）を受け取る
    // contract に統一。command 層で `parseDateTimeLocalAsJst` を通して JST 固定で UTC 化
    // （サーバ tz / ブラウザ tz 非依存）。空文字は `.or(z.literal(""))` で許容、normalize
    // 関数で null 化。
    startAt: z.iso
      .datetime({ local: true, error: "有効な日時を入力してください" })
      .or(z.literal(""))
      .nullable()
      .optional(),
    endAt: z.iso
      .datetime({ local: true, error: "有効な日時を入力してください" })
      .or(z.literal(""))
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!isDisplayPeriodOrderValid(data.startAt, data.endAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "終了日時は開始日時以降に設定してください",
      });
    }
  });

export type AnnouncementBarInput = z.infer<typeof announcementBarInputSchema>;

function normalizeAnnouncementBarInput(data: AnnouncementBarInput) {
  return {
    // PortableTextSpan[] を Prisma の Json 列に渡すための runtime narrow
    // (Zod schema 検証済 + helper による defensive type guard)
    message: asPrismaInputJsonValue(data.message, "message が不正です"),
    linkUrl: data.linkUrl || null,
    linkText: data.linkText || null,
    bgColor: data.bgColor || null,
    textColor: data.textColor || null,
    isActive: data.isActive,
    startAt:
      data.startAt && data.startAt !== ""
        ? parseDateTimeLocalAsJst(data.startAt)
        : null,
    endAt:
      data.endAt && data.endAt !== ""
        ? parseDateTimeLocalAsJst(data.endAt)
        : null,
  };
}

export async function getAnnouncementBars(): Promise<
  Serialized<AnnouncementBarData>[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  const items = await safeFetch({
    fetch: () =>
      prisma.announcementBar.findMany({
        select: announcementBarSelect,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAnnouncementBars",
  });

  return toPlainArray(items.map(shapeAnnouncementBarRow));
}

export async function getAnnouncementBarById(
  id: string,
): Promise<Serialized<AnnouncementBarData> | null> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  const row = await safeFetch({
    fetch: () =>
      prisma.announcementBar.findUnique({
        where: { id },
        select: announcementBarSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAnnouncementBarById",
  });

  return row === null ? null : toPlainObject(shapeAnnouncementBarRow(row));
}

export async function getActiveAnnouncementBars(): Promise<
  Serialized<AnnouncementBarData>[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  const items = await safeFetch({
    fetch: () =>
      prisma.announcementBar.findMany({
        where: { isActive: true },
        select: announcementBarSelect,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getActiveAnnouncementBars",
  });

  return toPlainArray(items.map(shapeAnnouncementBarRow));
}

export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settingsAnnouncementCarousel.findUnique({
        where: { id: "singleton" },
        select: carouselDbSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAnnouncementBarCarouselSettings",
  });

  if (!settings) {
    return defaultCarouselSettings;
  }

  return mapCarouselRowToDto(settings);
}

export async function updateAnnouncementBarCarouselSettings(
  data: AnnouncementBarCarouselSettingsInput,
): Promise<void> {
  const updateData = mapCarouselDtoToDb(data);

  await prisma.settingsAnnouncementCarousel.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function createAnnouncementBar(
  data: AnnouncementBarInput,
): Promise<{ id: string }> {
  const bar = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("announcement_bars:all"));

    const maxOrder = await tx.announcementBar.aggregate({
      _max: { displayOrder: true },
    });

    return tx.announcementBar.create({
      data: {
        ...normalizeAnnouncementBarInput(data),
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
    });
  });

  return { id: bar.id };
}

export async function updateAnnouncementBar(
  id: string,
  data: AnnouncementBarInput,
): Promise<void> {
  const existing = await prisma.announcementBar.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("お知らせバーが見つかりません", "NOT_FOUND");
  }

  await prisma.announcementBar.update({
    where: { id },
    data: normalizeAnnouncementBarInput(data),
  });
}

export async function reorderAnnouncementBars(
  orderedIds: readonly string[],
): Promise<{ updated: number }> {
  if (orderedIds.length === 0) {
    return { updated: 0 };
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }

  const existing = await prisma.announcementBar.findMany({
    select: { id: true },
  });
  const existingIds = new Set(existing.map((bar) => bar.id));

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw new DomainError("お知らせバーが見つかりません", "NOT_FOUND");
    }
  }

  if (existing.length !== orderedIds.length) {
    throw new DomainError(
      "お知らせバー数が一致しません（過不足）",
      "VALIDATION",
    );
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    orderedIds,
    (id) => id,
    (_id, index) => index,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("announcement_bars:all"));

    await tx.$executeRaw`
      UPDATE "announcement_bars"
      SET "displayOrder" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;

    await tx.$executeRaw`
      UPDATE "announcement_bars"
      SET "displayOrder" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  });

  return { updated: orderedIds.length };
}

export async function deleteAnnouncementBar(id: string): Promise<void> {
  const existing = await prisma.announcementBar.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("お知らせバーが見つかりません", "NOT_FOUND");
  }

  await prisma.announcementBar.delete({
    where: { id },
  });
}

export async function updateAnnouncementBarActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const existing = await prisma.announcementBar.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("お知らせバーが見つかりません", "NOT_FOUND");
  }

  await prisma.announcementBar.update({
    where: { id },
    data: { isActive },
  });
}
