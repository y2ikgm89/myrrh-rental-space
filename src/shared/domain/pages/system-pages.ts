import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  bootstrapSystemPagesCommand as bootstrapSystemPagesCommandWithDb,
  ensurePageSectionsCommand as ensurePageSectionsCommandWithDb,
} from "./system-pages-commands";

export async function ensurePageSectionsCommand(
  pageId: string,
  slug: string,
): Promise<number> {
  return ensurePageSectionsCommandWithDb(prisma, pageId, slug);
}

export async function bootstrapSystemPagesCommand(): Promise<void> {
  return bootstrapSystemPagesCommandWithDb(prisma);
}
