import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PageData } from "@/shared/domain/pages/types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

function Passthrough({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return <div {...props}>{children}</div>;
}

mock.module("@/admin/components/ui", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children?: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableCell: ({ children, ...props }: { children?: ReactNode }) => (
    <td {...props}>{children}</td>
  ),
  TableRow: ({ children, ...props }: { children?: ReactNode }) => (
    <tr {...props}>{children}</tr>
  ),
}));

mock.module("@/admin/components/EmptyState", () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
}));

mock.module("@/admin/components/status-badges", () => ({
  PageStatusBadge: ({ isPublished }: { isPublished: boolean }) => (
    <span>{isPublished ? "公開" : "下書き"}</span>
  ),
}));

mock.module("@/admin/components/ui/Pagination", () => ({
  Pagination: () => <nav aria-label="pagination" />,
}));

mock.module("@/shared/lib/date-format", () => ({
  formatDateTimeShort: () => "2026/01/01",
}));

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/PageActions",
  () => ({
    PageActions: () => <button type="button">操作</button>,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/BulkActions",
  () => ({
    BulkActions: ({ selectedSlugs }: { selectedSlugs: string[] }) =>
      selectedSlugs.length > 0 ? (
        <div data-testid="bulk-actions">{selectedSlugs.length}件選択中</div>
      ) : null,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/CreatePageDialog",
  () => ({
    CreatePageDialog: () => <div />,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/PageTableHeader",
  () => ({
    PageTableHeader: () => (
      <thead>
        <tr>
          <th>選択</th>
          <th>タイトル</th>
        </tr>
      </thead>
    ),
  }),
);

const { PageListTable } =
  await import("@/app/(admin)/admin/(dashboard)/pages/_components/PageListTable");

function makePage(slug: string, title: string): PageData {
  return {
    id: `page-${slug}`,
    slug,
    title,
    description: null,
    metaDescription: null,
    metaKeywords: null,
    ogpTitle: null,
    ogpDescription: null,
    ogpImageUrl: null,
    isPublished: false,
    publishedAt: null,
    isActive: true,
    isSystemPage: false,
    contentWidth: null,
    contentWidthCustom: null,
    showSidebar: null,
    sectionCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("PageListTable", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("ページ一覧の差し替え後は非表示ページの選択を一括操作に渡さない", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <PageListTable
          pages={[makePage("alpha", "Alpha"), makePage("beta", "Beta")]}
          total={2}
          currentPage={1}
          perPage={10}
        />,
      );
    });

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[aria-label="Alphaを選択"]',
    );
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      container.querySelector("[data-testid='bulk-actions']")?.textContent,
    ).toBe("1件選択中");

    await act(async () => {
      root?.render(
        <PageListTable
          pages={[makePage("gamma", "Gamma")]}
          total={1}
          currentPage={1}
          perPage={10}
        />,
      );
    });

    expect(container.querySelector("[data-testid='bulk-actions']")).toBeNull();
  });
});
