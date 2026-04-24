export type PageBuilderFreeformAuditState = {
  draftVersion: number;
  publishedVersion: number | null;
  lastPublishedAt: Date | null;
};

export type PageBuilderFreeformAuditPage = {
  slug: string;
  title: string;
  isPublished: boolean;
  sectionCount: number;
  revisionCount: number;
  freeformState: PageBuilderFreeformAuditState | null;
};

export type PageBuilderFreeformAuditReport = {
  pages: readonly PageBuilderFreeformAuditPage[];
  freeformStatePages: readonly PageBuilderFreeformAuditPage[];
  missingFreeformStatePages: readonly PageBuilderFreeformAuditPage[];
  pagesWithLegacySections: readonly PageBuilderFreeformAuditPage[];
  totalCustomPages: number;
  cleanBreakReady: boolean;
};

export function createPageBuilderFreeformAuditReport(
  pages: readonly PageBuilderFreeformAuditPage[],
): PageBuilderFreeformAuditReport {
  const freeformStatePages = pages.filter((page) => page.freeformState);
  const missingFreeformStatePages = pages.filter(
    (page) => page.freeformState === null,
  );
  const pagesWithLegacySections = pages.filter((page) => page.sectionCount > 0);

  return {
    pages,
    freeformStatePages,
    missingFreeformStatePages,
    pagesWithLegacySections,
    totalCustomPages: pages.length,
    cleanBreakReady: missingFreeformStatePages.length === 0,
  };
}

export function formatPageBuilderFreeformAuditReport(
  report: PageBuilderFreeformAuditReport,
): string {
  const lines = [
    "Page builder freeform audit",
    `Custom pages: ${report.totalCustomPages}`,
    `Clean-break ready: ${report.cleanBreakReady ? "yes" : "no"}`,
    `Missing freeform state: ${report.missingFreeformStatePages.length}`,
    `Legacy section backlog: ${report.pagesWithLegacySections.length}`,
    `Freeform state pages: ${report.freeformStatePages.length}`,
  ];

  if (report.missingFreeformStatePages.length > 0) {
    lines.push("", "Missing freeform state pages:");
    for (const page of report.missingFreeformStatePages) {
      lines.push(
        `- ${formatAuditPagePath(page.slug)} | ${page.title} | published=${page.isPublished} | sections=${page.sectionCount} | revisions=${page.revisionCount}`,
      );
    }
  }

  if (report.pagesWithLegacySections.length > 0) {
    lines.push("", "Pages with legacy sections:");
    for (const page of report.pagesWithLegacySections) {
      lines.push(
        `- ${formatAuditPagePath(page.slug)} | ${page.title} | sections=${page.sectionCount} | hasFreeformState=${page.freeformState !== null}`,
      );
    }
  }

  if (report.freeformStatePages.length > 0) {
    lines.push("", "Freeform state pages:");
    for (const page of report.freeformStatePages) {
      if (!page.freeformState) {
        continue;
      }

      lines.push(
        `- ${formatAuditPagePath(page.slug)} | ${page.title} | draftVersion=${page.freeformState.draftVersion} | publishedVersion=${formatNullableNumber(page.freeformState.publishedVersion)} | lastPublishedAt=${formatNullableDate(page.freeformState.lastPublishedAt)} | revisions=${page.revisionCount}`,
      );
    }
  }

  return lines.join("\n");
}

export function formatPageBuilderFreeformAuditError(error: unknown): string {
  const code = readStringProperty(error, "code");
  if (code && isDatabaseConnectionErrorCode(code)) {
    return `Page builder freeform audit failed (${code}): Database connection was refused. Start the database or set DATABASE_URL to a reachable database.`;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return code
    ? `Page builder freeform audit failed (${code}): ${message}`
    : `Page builder freeform audit failed: ${message}`;
}

function formatAuditPagePath(slug: string): string {
  const normalizedSlug = slug.trim();
  if (normalizedSlug.length === 0) {
    return "/";
  }

  return normalizedSlug.startsWith("/") ? normalizedSlug : `/${normalizedSlug}`;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "-" : value.toString();
}

function formatNullableDate(value: Date | null): string {
  return value === null ? "-" : value.toISOString();
}

function isDatabaseConnectionErrorCode(code: string): boolean {
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN"
  );
}

function readStringProperty(value: unknown, key: string): string | null {
  if (!isReadonlyRecord(value)) {
    return null;
  }

  const property = value[key];
  return typeof property === "string" ? property : null;
}

function isReadonlyRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
