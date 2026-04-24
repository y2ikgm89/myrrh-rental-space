import { describe, expect, test } from "bun:test";
import {
  createPageBuilderFreeformAuditReport,
  formatPageBuilderFreeformAuditError,
  formatPageBuilderFreeformAuditReport,
} from "@/shared/lib/page-builder/audit";

describe("page-builder freeform audit", () => {
  test("createPageBuilderFreeformAuditReport は custom page の freeform 移行状態を分類する", () => {
    const report = createPageBuilderFreeformAuditReport([
      {
        slug: "ready",
        title: "Ready Page",
        isPublished: true,
        sectionCount: 0,
        revisionCount: 4,
        freeformState: {
          draftVersion: 3,
          publishedVersion: 2,
          lastPublishedAt: new Date("2026-04-23T10:30:00.000Z"),
        },
      },
      {
        slug: "legacy",
        title: "Legacy Page",
        isPublished: true,
        sectionCount: 2,
        revisionCount: 0,
        freeformState: null,
      },
      {
        slug: "mixed",
        title: "Mixed Page",
        isPublished: false,
        sectionCount: 1,
        revisionCount: 1,
        freeformState: {
          draftVersion: 1,
          publishedVersion: null,
          lastPublishedAt: null,
        },
      },
    ]);

    expect(report.totalCustomPages).toBe(3);
    expect(report.cleanBreakReady).toBe(false);
    expect(report.missingFreeformStatePages.map((page) => page.slug)).toEqual([
      "legacy",
    ]);
    expect(report.pagesWithLegacySections.map((page) => page.slug)).toEqual([
      "legacy",
      "mixed",
    ]);
  });

  test("formatPageBuilderFreeformAuditReport は CI と手動確認で読める監査結果を出力する", () => {
    const report = createPageBuilderFreeformAuditReport([
      {
        slug: "ready",
        title: "Ready Page",
        isPublished: true,
        sectionCount: 0,
        revisionCount: 4,
        freeformState: {
          draftVersion: 3,
          publishedVersion: 2,
          lastPublishedAt: new Date("2026-04-23T10:30:00.000Z"),
        },
      },
      {
        slug: "legacy",
        title: "Legacy Page",
        isPublished: true,
        sectionCount: 2,
        revisionCount: 0,
        freeformState: null,
      },
    ]);

    const output = formatPageBuilderFreeformAuditReport(report);

    expect(output).toContain("Custom pages: 2");
    expect(output).toContain("Clean-break ready: no");
    expect(output).toContain("Missing freeform state: 1");
    expect(output).toContain("/legacy | Legacy Page | published=true");
    expect(output).toContain("Legacy section backlog: 1");
    expect(output).toContain("sections=2");
    expect(output).toContain(
      "/ready | Ready Page | draftVersion=3 | publishedVersion=2 | lastPublishedAt=2026-04-23T10:30:00.000Z | revisions=4",
    );
  });

  test("formatPageBuilderFreeformAuditError は DB 接続失敗を短い運用メッセージへ変換する", () => {
    expect(
      formatPageBuilderFreeformAuditError({
        code: "ECONNREFUSED",
      }),
    ).toBe(
      "Page builder freeform audit failed (ECONNREFUSED): Database connection was refused. Start the database or set DATABASE_URL to a reachable database.",
    );
  });
});
