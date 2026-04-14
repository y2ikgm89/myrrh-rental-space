import "server-only";

import { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import { NavigationType, SocialPlatform } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";

export const navigationItemInputSchema = z.object({
  type: z.enum(NavigationType),
  parentId: z.string().uuid().nullable().optional(),
  label: z
    .string()
    .min(1, { error: "ラベルは必須です" })
    .max(50, { error: "ラベルは50文字以内" }),
  url: z.string().min(1, { error: "URLは必須です" }).max(500),
  isExternal: z.boolean().default(false),
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

export const navigationOrderInputSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      order: z.number().int().min(0),
      parentId: z.string().uuid().nullable().optional(),
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
      id: z.string().uuid(),
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
  return {
    ...data,
    parentId: data.parentId ?? null,
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
  await prisma.$transaction(
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
  await prisma.$transaction(
    items.map((item) =>
      prisma.socialLink.update({
        where: { id: item.id },
        data: { order: item.order },
      }),
    ),
  );
}
