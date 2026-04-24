import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import {
  createPageBuilderFreeformAuditReport,
  formatPageBuilderFreeformAuditError,
  formatPageBuilderFreeformAuditReport,
  type PageBuilderFreeformAuditPage,
} from "../src/shared/lib/page-builder/audit";

async function main(): Promise<void> {
  const databaseUrl = readDatabaseUrl();
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
    max: 2,
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    await auditFreeformPages(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function auditFreeformPages(prisma: PrismaClient): Promise<void> {
  const pages = await prisma.page.findMany({
    where: {
      isSystemPage: false,
    },
    select: {
      slug: true,
      title: true,
      isPublished: true,
      freeformState: {
        select: {
          draftVersion: true,
          publishedVersion: true,
          lastPublishedAt: true,
        },
      },
      _count: {
        select: {
          sections: true,
          freeformRevisions: true,
        },
      },
    },
    orderBy: {
      slug: "asc",
    },
  });

  const auditPages: PageBuilderFreeformAuditPage[] = pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    isPublished: page.isPublished,
    sectionCount: page._count.sections,
    revisionCount: page._count.freeformRevisions,
    freeformState: page.freeformState,
  }));
  const report = createPageBuilderFreeformAuditReport(auditPages);

  console.log(formatPageBuilderFreeformAuditReport(report));

  if (!report.cleanBreakReady) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(formatPageBuilderFreeformAuditError(error));
  process.exitCode = 1;
}

function readDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}
