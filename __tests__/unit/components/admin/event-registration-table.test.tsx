import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const refreshMock = mock(() => {});
const cancelMock = mock();

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

mock.module("sonner", () => ({
  toast: {
    error: mock(() => undefined),
    success: mock(() => undefined),
  },
}));

mock.module("@/admin/actions/event-registration", () => ({
  adminCancelRegistration: (...args: Parameters<typeof cancelMock>) =>
    cancelMock(...args),
}));

mock.module("@/shared/lib/date-format", () => ({
  formatDateTimeShort: (value: string | Date) => `fmt:${String(value)}`,
}));

mock.module("@/admin/components/status-badges", () => ({
  RegistrationStatusBadge: ({ status }: { status: string }) => (
    <span>{status}</span>
  ),
}));

mock.module("@/admin/components/ui", () => ({
  Badge: ({
    children,
    variant,
  }: {
    children?: ReactNode;
    variant?: string;
  }) => <span data-variant={variant}>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Pagination: () => <nav aria-label="pagination" />,
  Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children?: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableCell: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children?: ReactNode }) => (
    <thead>{children}</thead>
  ),
  TableRow: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
}));

const { EventRegistrationTable } =
  await import("@/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable");

type Registration = React.ComponentProps<
  typeof EventRegistrationTable
>["registrations"][number];

function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "cm0reg12345678901234567",
    name: "佐藤花子",
    email: "sato@example.com",
    phone: null,
    note: null,
    quantity: 2,
    status: "CONFIRMED",
    cancelledAt: null,
    attendedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    slotStartAt: "2026-07-10T01:00:00.000Z",
    slotEndAt: "2026-07-10T02:00:00.000Z",
    ...overrides,
  };
}

describe("EventRegistrationTable", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    refreshMock.mockClear();
    cancelMock.mockReset();
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

  test("イベント詳細の申込一覧で出欠状態と出席日時を確認できる", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <EventRegistrationTable
          registrations={[
            makeRegistration({
              id: "cm0reg12345678901234567",
              name: "出席済み参加者",
              attendedAt: "2026-07-10T01:30:00.000Z",
            }),
            makeRegistration({
              id: "cm0reg98765432109876543",
              name: "未出席参加者",
              attendedAt: null,
            }),
            makeRegistration({
              id: "cm0regcancelled00000001",
              name: "キャンセル参加者",
              status: "CANCELLED",
              cancelledAt: "2026-07-01T00:00:00.000Z",
            }),
          ]}
          total={3}
          currentPage={1}
          perPage={20}
        />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).toContain("出欠");
    expect(text).toContain("出席済");
    expect(text).toContain("fmt:2026-07-10T01:30:00.000Z");
    expect(text).toContain("未出席");
  });
});
