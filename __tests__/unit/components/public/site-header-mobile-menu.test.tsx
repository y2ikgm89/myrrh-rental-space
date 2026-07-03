import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PublicNavItem } from "@/shared/domain/navigation/queries";

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

class MediaQueryListStub {
  onchange: ((event: MediaQueryListEvent) => void) | null = null;
  matches = false;
  readonly media: string;
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>();

  constructor(media: string) {
    this.media = media;
  }

  addEventListener(
    type: string,
    listener: (event: MediaQueryListEvent) => void,
  ): void {
    if (type === "change") this.listeners.add(listener);
  }

  removeEventListener(
    type: string,
    listener: (event: MediaQueryListEvent) => void,
  ): void {
    if (type === "change") this.listeners.delete(listener);
  }

  dispatch(matches: boolean): void {
    this.matches = matches;
    const event = new window.Event("change") as MediaQueryListEvent;
    Object.defineProperties(event, {
      matches: { value: matches },
      media: { value: this.media },
    });
    for (const listener of this.listeners) listener(event);
    this.onchange?.(event);
  }
}

const mediaQueryLists = new Map<string, MediaQueryListStub>();

function setMediaQueryMatches(media: string, matches: boolean): void {
  window.matchMedia(media);
  mediaQueryLists.get(media)?.dispatch(matches);
}

Object.defineProperty(window, "matchMedia", {
  value: (media: string) => {
    const existing = mediaQueryLists.get(media);
    if (existing) return existing;

    const list = new MediaQueryListStub(media);
    mediaQueryLists.set(media, list);
    return list;
  },
  configurable: true,
});

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

const brand = {
  siteName: "Myrrh Rental Space",
  logoUrl: null,
  useLogo: false,
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function textLabel(key: string, text: string): PublicNavItem["label"] {
  return [{ _key: key, _type: "span", text }];
}

function renderHeader(navItems: readonly PublicNavItem[] = []): void {
  root?.render(
    <Header
      brand={brand}
      navItems={navItems}
      scrollBehavior={HeaderScrollBehavior.always_visible}
      backgroundMode={HeaderBackgroundMode.transparent}
      authSlot={null}
    />,
  );
}

async function openMobileMenu(): Promise<HTMLButtonElement> {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="メニューを開く"]',
  );
  expect(trigger).not.toBeNull();

  await act(async () => {
    trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  return trigger as HTMLButtonElement;
}

describe("public site header mobile menu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mediaQueryLists.clear();
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
      renderHeader();
    });

    await openMobileMenu();

    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-labelledby]',
    );
    const overlay = document.querySelector<HTMLElement>(".backdrop-blur-xl");

    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain("bg-background/95");
    expect(dialog).not.toBeNull();
    expect(dialog?.className).toContain("bg-background");
  });

  test("opened mobile menu closes when the viewport reaches the desktop breakpoint", async () => {
    await act(async () => {
      renderHeader();
    });

    await openMobileMenu();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      setMediaQueryMatches("(min-width: 64rem)", true);
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("mobile menu controls expose visible focus ring classes", async () => {
    await act(async () => {
      renderHeader([
        {
          id: "spaces",
          label: textLabel("spaces-label", "Spaces"),
          url: "/spaces",
          isExternal: false,
          children: [],
        },
      ]);
    });

    const trigger = await openMobileMenu();
    const closeButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="メニューを閉じる"]',
    );
    const mobileNav = document.querySelector<HTMLElement>(
      '[role="dialog"] nav',
    );
    expect(mobileNav).not.toBeNull();
    const spacesLink = Array.from(
      mobileNav?.querySelectorAll<HTMLAnchorElement>("a") ?? [],
    ).find((anchor) => anchor.textContent === "Spaces");
    const reserveLink = Array.from(
      mobileNav?.querySelectorAll<HTMLAnchorElement>("a") ?? [],
    ).find((anchor) => anchor.textContent === "Reserve");

    for (const element of [trigger, closeButton, spacesLink, reserveLink]) {
      expect(element).not.toBeNull();
      expect(element?.className).toContain("focus-visible:ring-2");
      expect(element?.className).toContain("focus-visible:ring-ring");
    }
  });
});
