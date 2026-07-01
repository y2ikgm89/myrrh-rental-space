import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

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

function Passthrough({
  children,
  asChild: _asChild,
  ...props
}: {
  children?: ReactNode;
  asChild?: boolean;
  [key: string]: unknown;
}) {
  return <div {...props}>{children}</div>;
}

mock.module("@/admin/components/ui", () => ({
  DropdownMenu: Passthrough,
  DropdownMenuTrigger: Passthrough,
  DropdownMenuContent: Passthrough,
  DropdownMenuItem: ({
    children,
    asChild: _asChild,
    ...props
  }: {
    children?: ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

mock.module("@/admin/components/ActionDropdown", () => ({
  ActionDropdown: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  ActionDropdownItem: ({
    children,
    href,
  }: {
    children?: ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const { UserActions } =
  await import("@/app/(admin)/admin/(dashboard)/staff/_components/UserActions");

type TestUser = Parameters<typeof UserActions>[0]["user"];

function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: "admin-1",
    email: "staff@example.com",
    name: "Staff User",
    role: "ADMIN",
    emailVerified: true,
    image: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    _count: { reservations: 0, posts: 0 },
    ...overrides,
  };
}

function containerText(element: Element | null | undefined): string {
  return element?.textContent ?? "";
}

describe("UserActions", () => {
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

  test("Google Group 同期モデルでは一覧行メニューを詳細表示だけにする", async () => {
    await act(async () => {
      root?.render(<UserActions user={makeUser()} />);
    });

    const text = containerText(container);
    expect(text).toContain("詳細");
    expect(text).not.toContain("編集");
    expect(text).not.toContain("削除");
    expect(text).not.toContain("案内メール");
  });
});
