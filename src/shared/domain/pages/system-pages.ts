import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  bootstrapSystemPagesCommand as bootstrapSystemPagesCommandWithDb,
  ensureHomepageSectionsCommand as ensureHomepageSectionsCommandWithDb,
  ensurePageSectionsCommand as ensurePageSectionsCommandWithDb,
} from "./system-pages-commands";

export async function ensurePageSectionsCommand(
  pageId: string,
  slug: string,
): Promise<number> {
  return ensurePageSectionsCommandWithDb(prisma, pageId, slug);
}

export async function ensureHomepageSectionsCommand(): Promise<number> {
  return ensureHomepageSectionsCommandWithDb(prisma);
}

export async function bootstrapSystemPagesCommand(): Promise<void> {
  return bootstrapSystemPagesCommandWithDb(prisma);
}
