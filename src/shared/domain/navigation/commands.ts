import "server-only";

import { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import { isPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { NavigationType, SocialPlatform } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { createSpanArraySchema } from "@/shared/lib/portable-text/schema";
import { spansToPlainText } from "@/shared/lib/portable-text";

export const navigationItemInputSchema = z.object({
  type: z.enum(NavigationType),
  parentId: z.uuid().nullable().optional(),
  /**
   * Sanity Portable Text 互換の Span 配列（テキスト + アイコン混在）。
   * icon-only モード（span token ゼロ）は NN/g 準拠で UI 層が拒否する想定。
   */
  label: createSpanArraySchema({ maxSpans: 30 }).refine(
    (spans) => spansToPlainText(spans).trim().length > 0,
    { error: "ラベルにテキストを 1 文字以上含めてください" },
  ),
  url: z.string().min(1, { error: "URLは必須です" }).max(500),
  isExternal: z.boolean().default(false),
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

export const navigationOrderInputSchema = z
  .array(
    z.object({
      id: z.uuid(),
      order: z.number().int().min(0),
      parentId: z.uuid().nullable().optional(),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  });

export const socialLinkInputSchema = z.object({
  platform: z.enum(SocialPlatform),
  url: z
    .string()
    .min(1, { error: "URLは必須です" })
    .url({ error: "有効なURLを入力してください" }),
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
  showOnDesktop: z.boolean().default(true),
  showOnMobile: z.boolean().default(true),
});

export const socialLinkOrderInputSchema = z
  .array(
    z.object({
      id: z.uuid(),
      order: z.number().int().min(0),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  });

export type NavigationItemInput = z.infer<typeof navigationItemInputSchema>;
export type NavigationOrderInput = z.infer<typeof navigationOrderInputSchema>;
export type SocialLinkInput = z.infer<typeof socialLinkInputSchema>;
export type SocialLinkOrderInput = z.infer<typeof socialLinkOrderInputSchema>;

function normalizeNavigationItemInput(data: NavigationItemInput) {
  // PortableTextSpan[] discriminated union を Prisma の Json 列に渡す境界。
  // Zod が runtime 検証済みのため `isPrismaInputJsonValue` で型 narrow するだけで十分。
  if (!isPrismaInputJsonValue(data.label)) {
    throw new DomainError("ナビゲーションラベルが不正です", "VALIDATION");
  }
  return {
    ...data,
    parentId: data.parentId ?? null,
    label: data.label,
  };
}

export async function createNavigationItem(
  data: NavigationItemInput,
): Promise<{ id: string }> {
  const item = await prisma.navigationItem.create({
    data: normalizeNavigationItemInput(data),
  });

  return { id: item.id };
}

export async function updateNavigationItem(
  id: string,
  data: NavigationItemInput,
): Promise<void> {
  const existing = await prisma.navigationItem.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("ナビゲーションが見つかりません", "NOT_FOUND");
  }

  await prisma.navigationItem.update({
    where: { id },
    data: normalizeNavigationItemInput(data),
  });
}

export async function deleteNavigationItem(id: string): Promise<void> {
  const item = await prisma.navigationItem.findUnique({
    where: { id },
    select: {
      id: true,
      children: {
        select: { id: true },
      },
    },
  });

  if (!item) {
    throw new DomainError("ナビゲーションが見つかりません", "NOT_FOUND");
  }

  if (item.children.length > 0) {
    throw new DomainError("サブメニューがあるため削除できません", "CONFLICT");
  }

  await prisma.navigationItem.delete({
    where: { id },
  });
}

export async function updateNavigationOrder(
  items: NavigationOrderInput,
): Promise<void> {
  await Promise.all(
    items.map((item) =>
      prisma.navigationItem.update({
        where: { id: item.id },
        data: {
          order: item.order,
          ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
        },
      }),
    ),
  );
}

function normalizeSocialLinkInput(data: SocialLinkInput) {
  return { ...data };
}

export async function createSocialLink(
  data: SocialLinkInput,
): Promise<{ id: string }> {
  const link = await prisma.socialLink.create({
    data: normalizeSocialLinkInput(data),
  });

  return { id: link.id };
}

export async function updateSocialLink(
  id: string,
  data: SocialLinkInput,
): Promise<void> {
  const existing = await prisma.socialLink.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("SNSリンクが見つかりません", "NOT_FOUND");
  }

  await prisma.socialLink.update({
    where: { id },
    data: normalizeSocialLinkInput(data),
  });
}

export async function deleteSocialLink(id: string): Promise<void> {
  const existing = await prisma.socialLink.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("SNSリンクが見つかりません", "NOT_FOUND");
  }

  await prisma.socialLink.delete({
    where: { id },
  });
}

export async function updateSocialLinkOrder(
  items: SocialLinkOrderInput,
): Promise<void> {
  await Promise.all(
    items.map((item) =>
      prisma.socialLink.update({
        where: { id: item.id },
        data: { order: item.order },
      }),
    ),
  );
}
