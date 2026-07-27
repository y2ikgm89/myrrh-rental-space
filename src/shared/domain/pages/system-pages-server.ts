import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  bootstrapSystemPagesCommand,
  ensurePageSectionsCommand,
} from "@/shared/domain/pages/system-pages-commands";

/**
 * Next 専用: default `prisma` を注入する薄いラッパ。
 * seed は `system-pages-commands` を直接呼ぶ（本ファイルは server-only）。
 */

export async function ensurePageSections(
  pageId: string,
  slug: string,
): Promise<number> {
  return ensurePageSectionsCommand(prisma, pageId, slug);
}

export async function bootstrapSystemPages(): Promise<void> {
  await bootstrapSystemPagesCommand(prisma);
}
