import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const refreshMock = mock(() => {});
const toastErrorMock = mock(() => {});
const toastSuccessMock = mock(() => {});
const deleteUserMock = mock(async () => ({}));
const resendStaffAccessGuideMock = mock(async () => ({
  message: "管理画面の案内メールを送信しました。",
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

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

mock.module("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

mock.module("@/admin/actions/user", () => ({
  deleteUser: deleteUserMock,
  resendStaffAccessGuide: resendStaffAccessGuideMock,
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
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: {
    children?: ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenu: Passthrough,
  DropdownMenuTrigger: Passthrough,
  DropdownMenuContent: Passthrough,
  DropdownMenuItem: ({
    children,
    onClick,
    asChild: _asChild,
    ...props
  }: {
    children?: ReactNode;
    onClick?: () => void;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

mock.module("@/admin/components/ui/button", () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: {
    children?: ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module("@/admin/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) => (open ? <div>{children}</div> : null),
  AlertDialogAction: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogContent: Passthrough,
  AlertDialogDescription: Passthrough,
  AlertDialogFooter: Passthrough,
  AlertDialogHeader: Passthrough,
  AlertDialogTitle: Passthrough,
  AlertDialogTrigger: Passthrough,
}));

mock.module("@/admin/components/DeleteConfirmDialog", () => ({
  DeleteConfirmDialog: () => null,
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

function textContent(): string {
  return containerText(window.document.body);
}

function containerText(element: Element | null | undefined): string {
  return element?.textContent ?? "";
}

function getButtonByText(text: string): HTMLButtonElement {
  const buttons = [...window.document.querySelectorAll("button")];
  const button = buttons.find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe("UserActions", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let consoleErrorMessages: string[] = [];
  const originalConsoleError = console.error;

  beforeEach(() => {
    consoleErrorMessages = [];
    console.error = mock((...args: unknown[]) => {
      consoleErrorMessages.push(args.map(String).join(" "));
    }) as typeof console.error;

    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    refreshMock.mockClear();
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
    deleteUserMock.mockClear();
    resendStaffAccessGuideMock.mockClear();
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

    const messages = consoleErrorMessages;
    console.error = originalConsoleError;
    expect(messages).toEqual([]);
  });

  test("作成権限がある上位ロールには一覧行メニューで案内メール操作を表示する", async () => {
    await act(async () => {
      root?.render(
        <UserActions
          currentUser={{ id: "super-admin-1", role: "SUPER_ADMIN" }}
          user={makeUser()}
        />,
      );
    });

    expect(container?.textContent).toContain("案内メール");
  });

  test("案内メール操作から確認ダイアログを開いて送信する", async () => {
    await act(async () => {
      root?.render(
        <UserActions
          currentUser={{ id: "super-admin-1", role: "SUPER_ADMIN" }}
          user={makeUser()}
        />,
      );
    });

    await act(async () => {
      getButtonByText("案内メール").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });

    expect(textContent()).toContain("案内メールを送信しますか？");
    expect(textContent()).toContain("Staff User");
    expect(textContent()).toContain("staff@example.com");

    await act(async () => {
      getButtonByText("送信").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(resendStaffAccessGuideMock).toHaveBeenCalledWith("admin-1");
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "管理画面の案内メールを送信しました。",
    );
    expect(textContent()).not.toContain("案内メールを送信しますか？");
  });

  test("対象ロールを操作できない場合は案内メール操作を表示しない", async () => {
    await act(async () => {
      root?.render(
        <UserActions
          currentUser={{ id: "admin-operator", role: "ADMIN" }}
          user={makeUser({ id: "peer-admin", role: "ADMIN" })}
        />,
      );
    });

    expect(containerText(container)).not.toContain("案内メール");
  });
});
