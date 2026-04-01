import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  AnnouncementBarType,
} from "@/shared/db/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";

export type AnnouncementBarData = {
  id: string;
  message: string;
  type: AnnouncementBarType;
  linkUrl: string | null;
  linkText: string | null;
  bgColor: string | null;
  textColor: string | null;
  isActive: boolean;
  priority: number;
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
  type: true,
  linkUrl: true,
  linkText: true,
  bgColor: true,
  textColor: true,
  isActive: true,
  priority: true,
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const defaultCarouselSettings: AnnouncementBarCarouselSettings = {
  announcementBarAnimation: AnnouncementBarAnimation.fade,
  announcementBarDuration: 5000,
  announcementBarAutoPlay: true,
  announcementBarPauseOnHover: true,
  announcementBarShowArrows: true,
  announcementBarShowIndicator: true,
  announcementBarDesignStyle: AnnouncementBarDesignStyle.solid,
  announcementBarBgColor: null,
  announcementBarTextColor: null,
  announcementBarStripeColor: null,
  announcementBarStripeAnimation: false,
  announcementBarGradientAnimation: false,
  announcementBarGlassAnimation: false,
  announcementBarSticky: false,
};

export const announcementBarInputSchema = z.object({
  message: z
    .string()
    .min(1, { error: "メッセージは必須です" })
    .max(200, { error: "メッセージは200文字以内で入力してください" }),
  type: z.enum(AnnouncementBarType).default(AnnouncementBarType.info),
  linkUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .or(z.literal(""))
    .nullable()
    .optional(),
  linkText: z
    .string()
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
  priority: z.number().int().min(0).max(100).default(0),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
});

export type AnnouncementBarInput = z.infer<typeof announcementBarInputSchema>;

function normalizeAnnouncementBarInput(data: AnnouncementBarInput) {
  return {
    message: data.message,
    type: data.type,
    linkUrl: data.linkUrl || null,
    linkText: data.linkText || null,
    bgColor: data.bgColor || null,
    textColor: data.textColor || null,
    isActive: data.isActive,
    priority: data.priority,
    startAt: data.startAt ? new Date(data.startAt) : null,
    endAt: data.endAt ? new Date(data.endAt) : null,
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
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAnnouncementBars",
  });

  return toPlainArray(items);
}

export async function getAnnouncementBarById(
  id: string,
): Promise<Serialized<AnnouncementBarData> | null> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  return toPlainObject(
    await safeFetch({
      fetch: () =>
        prisma.announcementBar.findUnique({
          where: { id },
          select: announcementBarSelect,
        }),
      fallback: null,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getAnnouncementBarById",
    }),
  );
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
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getActiveAnnouncementBars",
  });

  return toPlainArray(items);
}

export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          announcementBarAnimation: true,
          announcementBarDuration: true,
          announcementBarAutoPlay: true,
          announcementBarPauseOnHover: true,
          announcementBarShowArrows: true,
          announcementBarShowIndicator: true,
          announcementBarDesignStyle: true,
          announcementBarBgColor: true,
          announcementBarTextColor: true,
          announcementBarStripeColor: true,
          announcementBarStripeAnimation: true,
          announcementBarGradientAnimation: true,
          announcementBarGlassAnimation: true,
          announcementBarSticky: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAnnouncementBarCarouselSettings",
  });

  if (!settings) {
    return defaultCarouselSettings;
  }

  return {
    announcementBarAnimation:
      settings.announcementBarAnimation ??
      defaultCarouselSettings.announcementBarAnimation,
    announcementBarDuration:
      settings.announcementBarDuration ??
      defaultCarouselSettings.announcementBarDuration,
    announcementBarAutoPlay:
      settings.announcementBarAutoPlay ??
      defaultCarouselSettings.announcementBarAutoPlay,
    announcementBarPauseOnHover:
      settings.announcementBarPauseOnHover ??
      defaultCarouselSettings.announcementBarPauseOnHover,
    announcementBarShowArrows:
      settings.announcementBarShowArrows ??
      defaultCarouselSettings.announcementBarShowArrows,
    announcementBarShowIndicator:
      settings.announcementBarShowIndicator ??
      defaultCarouselSettings.announcementBarShowIndicator,
    announcementBarDesignStyle:
      settings.announcementBarDesignStyle ??
      defaultCarouselSettings.announcementBarDesignStyle,
    announcementBarBgColor: settings.announcementBarBgColor,
    announcementBarTextColor: settings.announcementBarTextColor,
    announcementBarStripeColor: settings.announcementBarStripeColor,
    announcementBarStripeAnimation:
      settings.announcementBarStripeAnimation ??
      defaultCarouselSettings.announcementBarStripeAnimation,
    announcementBarGradientAnimation:
      settings.announcementBarGradientAnimation ??
      defaultCarouselSettings.announcementBarGradientAnimation,
    announcementBarGlassAnimation:
      settings.announcementBarGlassAnimation ??
      defaultCarouselSettings.announcementBarGlassAnimation,
    announcementBarSticky:
      settings.announcementBarSticky ??
      defaultCarouselSettings.announcementBarSticky,
  };
}

export async function updateAnnouncementBarCarouselSettings(
  data: AnnouncementBarCarouselSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function createAnnouncementBar(
  data: AnnouncementBarInput,
): Promise<{ id: string }> {
  const bar = await prisma.announcementBar.create({
    data: normalizeAnnouncementBarInput(data),
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

export async function toggleAnnouncementBarActive(id: string): Promise<void> {
  const bar = await prisma.announcementBar.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!bar) {
    throw new DomainError("お知らせバーが見つかりません", "NOT_FOUND");
  }

  await prisma.announcementBar.update({
    where: { id },
    data: {
      isActive: !bar.isActive,
    },
  });
}
