import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

process.env["NEXT_PUBLIC_BASE_URL"] = "https://rental-space.myrrh-jp.com";
process.env["NEXT_PUBLIC_APP_URL"] = "https://admin.myrrh-jp.com";

mock.module("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

mock.module("@/admin/contexts/admin-layout-context", () => ({
  useAdminLayout: () => ({
    toggleSidebar: mock(),
    isMobile: false,
    isFullscreen: false,
    hasMounted: true,
  }),
}));

const { TopBar } =
  await import("@/app/(admin)/admin/(dashboard)/_components/TopBar");

describe("TopBar", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
  });

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

  test("公開サイトを開く action is clearly presented as an external public-site button", async () => {
    await act(async () => {
      root?.render(
        <TopBar
          branding={<span>管理画面</span>}
          notifications={<span />}
          searchTrigger={null}
        />,
      );
    });

    const viewSiteLink = Array.from(
      container?.querySelectorAll<HTMLAnchorElement>("a") ?? [],
    ).find((anchor) => anchor.textContent?.trim() === "公開サイトを開く");

    expect(viewSiteLink?.getAttribute("href")).toBe(
      "https://rental-space.myrrh-jp.com",
    );
    expect(viewSiteLink?.getAttribute("target")).toBe("_blank");
    expect(viewSiteLink?.getAttribute("rel")).toContain("noreferrer");
    expect(viewSiteLink?.className).toContain("rounded-md");
    expect(viewSiteLink?.className).toContain("border");
    expect(viewSiteLink?.className).toContain("gap-2");
    expect(
      viewSiteLink?.querySelector('svg[aria-hidden="true"]'),
    ).not.toBeNull();
  });
});
