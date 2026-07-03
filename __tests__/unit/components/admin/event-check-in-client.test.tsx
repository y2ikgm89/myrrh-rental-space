import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const refreshMock = mock(() => {});
const toggleMock = mock();
const createWalkInMock = mock();

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

mock.module("sonner", () => ({
  toast: {
    error: mock(() => undefined),
    success: mock(() => undefined),
  },
}));

mock.module("@tabler/icons-react", () => ({
  IconRefresh: () => <span aria-hidden="true" />,
  IconSearch: () => <span aria-hidden="true" />,
  IconUserPlus: () => <span aria-hidden="true" />,
  IconCheck: () => <span aria-hidden="true" />,
}));

mock.module("@/admin/actions/event-registration", () => ({
  toggleEventRegistrationCheckIn: (...args: Parameters<typeof toggleMock>) =>
    toggleMock(...args),
  createWalkInRegistration: (...args: Parameters<typeof createWalkInMock>) =>
    createWalkInMock(...args),
}));

mock.module("@/admin/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
    "aria-label": ariaLabel,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
    "aria-label"?: string;
  }) => (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Label: ({
    children,
    htmlFor,
  }: {
    children?: ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
  SubmitButton: ({
    label,
    isPending,
  }: {
    label: string;
    isPending: boolean;
  }) => (
    <button type="submit" disabled={isPending}>
      {label}
    </button>
  ),
}));

mock.module("@/shared/lib/cn", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const { CheckInClient } =
  await import("@/app/(admin)/admin/(dashboard)/events/[id]/check-in/_components/CheckInClient");

type Attendee = React.ComponentProps<
  typeof CheckInClient
>["initialAttendees"][number];

function makeAttendee(overrides: Partial<Attendee> = {}): Attendee {
  return {
    id: "cm0reg12345678901234567",
    name: "佐藤花子",
    email: "sato@example.com",
    phone: null,
    quantity: 2,
    attendedAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    ticket: { id: "cm0ticket1234567890123", name: "一般" },
    ...overrides,
  };
}

function renderClient(root: Root, attendees: Attendee[]) {
  root.render(
    <CheckInClient
      eventId="cm0event1234567890123456"
      initialAttendees={attendees}
      tickets={[{ id: "cm0ticket1234567890123", name: "一般", price: 0 }]}
      slots={[
        {
          id: "uvslot123456789012345678",
          startAt: "2026-07-10T01:00:00.000Z",
          endAt: "2026-07-10T02:00:00.000Z",
        },
      ]}
    />,
  );
}

describe("CheckInClient", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    refreshMock.mockClear();
    toggleMock.mockReset();
    createWalkInMock.mockReset();
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

  test("出席済み人数は申込件数ではなく quantity 合計で表示する", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      renderClient(root, [makeAttendee({ quantity: 2 })]);
    });

    expect(container?.textContent).toMatch(/2\s*\/\s*2\s*名チェック済/u);
  });

  test("refresh 後に Server Component から届いた参加者 props を一覧 state に同期する", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      renderClient(root, [makeAttendee({ id: "cm0reg12345678901234567" })]);
    });

    await act(async () => {
      if (!root) throw new Error("root missing");
      renderClient(root, [
        makeAttendee({ id: "cm0reg12345678901234567" }),
        makeAttendee({
          id: "cm0reg98765432109876543",
          name: "当日参加",
          email: null,
          quantity: 1,
        }),
      ]);
    });

    expect(container?.textContent).toContain("当日参加");
    expect(container?.textContent).toMatch(/3\s*\/\s*3\s*名チェック済/u);
  });
});
