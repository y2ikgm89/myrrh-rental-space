import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/* eslint-disable @eslint-react/no-unnecessary-use-prefix -- Next hook exports are mocked by their real API names. */

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as typeof ResizeObserver;
globalThis.NodeFilter = window.NodeFilter;

mock.module("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

mock.module("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: mock(),
    refresh: mock(),
  }),
}));

mock.module("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => (
    <span data-src={src} aria-label={alt} className={className}>
      {alt}
    </span>
  ),
}));

mock.module("@gsap/react", () => ({
  useGSAP: () => {},
}));

mock.module("@/public/lib/gsap-config", () => ({
  gsap: {
    matchMedia: () => ({
      add: () => {},
      revert: () => {},
    }),
  },
  ScrollTrigger: {
    create: () => {},
  },
}));

const { Header } = await import("@/public/components/layouts/site-header");
const { HeaderBackgroundMode, HeaderScrollBehavior } =
  await import("@/shared/lib/validations/enums/prisma-types");

describe("public site header mobile menu", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    document.body.innerHTML = "";
    root = undefined;
    container = undefined;
  });

  test("opened mobile menu renders the Radix modal overlay and an opaque content surface", async () => {
    await act(async () => {
      root?.render(
        <Header
          brand={{
            siteName: "Myrrh Rental Space",
            logoUrl: null,
            useLogo: false,
          }}
          navItems={[]}
          scrollBehavior={HeaderScrollBehavior.always_visible}
          backgroundMode={HeaderBackgroundMode.transparent}
          authSlot={null}
        />,
      );
    });

    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="メニューを開く"]',
    );
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-labelledby]',
    );
    const overlay = document.querySelector<HTMLElement>(".backdrop-blur-xl");

    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain("bg-background/95");
    expect(dialog).not.toBeNull();
    expect(dialog?.className).toContain("bg-background");
  });
});
