import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NuqsAdapter } from "nuqs/adapters/react";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const refreshMock = mock(() => {});
const cancelMock = mock();

mock.module("next/navigation", () => ({
  // `verifyAdminSession` の拒否は notFound()。mock に無いと module load で落ちる。
  notFound: mock(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ refresh: refreshMock }),
  redirect: mock(),
}));

// EventRegistrationTable (Task 4: 検索・フィルタ) は useQueryStates を使うため
// <NuqsAdapter> context が実行時に必須になった。nuqs / @/shared/lib/nuqs/parsers
// (内部で多数の nuqs プリミティブを使う) は mock せず実体をそのまま使い、
// render 側を nuqs/adapters/react の NuqsAdapter で包むことで対応する
// （下の render 呼び出し箇所を参照）。

mock.module("sonner", () => ({
  toast: {
    error: mock(() => undefined),
    success: mock(() => undefined),
  },
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
  // task #9 PR#5 task B: EventRegistrationTable が RefundDialog を import する経路で
  // Dialog / Input / Label / Select / Textarea も module 解決を要求する。
  // 実 render は refundTarget が set された時のみ発生するため、no-op stub で十分。
  Dialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
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
  Input: () => <input />,
  Label: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => <span />,
  Textarea: () => <textarea />,
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.currentTarget.checked)}
    />
  ),
}));

// task #9 PR#5 task B: refundEventRegistrationPayment action も event-registration
// mock に追加 (未使用ケースだが module 解決に必要)。
mock.module("@/admin/actions/event-registration", () => ({
  adminCancelRegistration: (...args: Parameters<typeof cancelMock>) =>
    cancelMock(...args),
  refundEventRegistrationPayment: mock(),
  bulkCancelEventRegistrations: mock(),
  bulkCheckInEventRegistrations: mock(),
  updateEventRegistration: mock(),
  recordManualEventPayment: mock(),
  createEventCheckoutSession: mock(),
}));

mock.module("@/admin/components/FloatingBulkActionBar", () => ({
  FloatingBulkActionBar: ({ children }: { children?: ReactNode }) => (
    <div data-testid="floating-bulk-action-bar">{children}</div>
  ),
}));

const { EventRegistrationTable } =
  await import("@/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable");

type Registration = React.ComponentProps<
  typeof EventRegistrationTable
>["registrations"][number];

function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "60e01261-0546-4528-8a03-68d37a9d9568",
    name: "佐藤花子",
    email: "sato@example.com",
    phone: null,
    note: null,
    quantity: 2,
    status: "CONFIRMED",
    // task #9 PR#5 task B (admin event refund UI) で追加。デフォルトは
    // 「Stripe 決済なし」= 返金ボタン非表示。
    paymentStatus: "UNPAID",
    paidAmount: null,
    stripePaymentIntentId: null,
    stripeCheckoutSessionId: null,
    cumulativeRefunded: 0,
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
        <NuqsAdapter>
          <EventRegistrationTable
            eventId="ae255aca-d24a-49e4-8e57-3904b3889477"
            registrations={[
              makeRegistration({
                id: "60e01261-0546-4528-8a03-68d37a9d9568",
                name: "出席済み参加者",
                attendedAt: "2026-07-10T01:30:00.000Z",
              }),
              makeRegistration({
                id: "6a95721c-bd35-4206-87fa-fa0102fb5f88",
                name: "未出席参加者",
                attendedAt: null,
              }),
              makeRegistration({
                id: "19d5a86d-4740-4fb7-830d-2bc89ac03abd",
                name: "キャンセル参加者",
                status: "CANCELLED",
                cancelledAt: "2026-07-01T00:00:00.000Z",
              }),
            ]}
            total={3}
            currentPage={1}
            perPage={20}
            paymentEnabled={true}
          />
        </NuqsAdapter>,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).toContain("出欠");
    expect(text).toContain("出席済");
    // UTC 01:30 は JST 10:30。実 formatter を使うので時差の取り違えも落ちる。
    expect(text).toContain("2026/07/10 10:30");
    expect(text).toContain("未出席");
  });

  function buttonLabels(): string[] {
    return [...(container?.querySelectorAll("button") ?? [])].map(
      (button) => button.textContent ?? "",
    );
  }

  async function renderTable(
    registrations: Registration[],
    paymentEnabled: boolean,
  ) {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <NuqsAdapter>
          <EventRegistrationTable
            eventId="ae255aca-d24a-49e4-8e57-3904b3889477"
            registrations={registrations}
            total={registrations.length}
            currentPage={1}
            perPage={20}
            paymentEnabled={paymentEnabled}
          />
        </NuqsAdapter>,
      );
    });
  }

  test("payment OFF + UNPAID: Stripe決済非表示、入金記録は表示", async () => {
    await renderTable([makeRegistration()], false);

    const labels = buttonLabels();
    expect(labels.some((label) => label.includes("Stripe決済"))).toBe(false);
    expect(labels.some((label) => label.includes("入金記録"))).toBe(true);
  });

  test("payment ON + UNPAID: Stripe決済と入金記録を表示", async () => {
    await renderTable([makeRegistration()], true);

    const labels = buttonLabels();
    expect(labels.some((label) => label.includes("Stripe決済"))).toBe(true);
    expect(labels.some((label) => label.includes("入金記録"))).toBe(true);
  });

  test("payment OFF + Stripe PAID: Stripe 履歴があるとき返金ボタン表示", async () => {
    await renderTable(
      [
        makeRegistration({
          paymentStatus: "PAID",
          paidAmount: 5000,
          stripePaymentIntentId: "pi_test_123",
        }),
      ],
      false,
    );

    const labels = buttonLabels();
    expect(labels.some((label) => label.includes("返金"))).toBe(true);
    expect(labels.some((label) => label.includes("Stripe決済"))).toBe(false);
  });
});
