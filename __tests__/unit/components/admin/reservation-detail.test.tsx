import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock() }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

mock.module("sonner", () => ({
  toast: { error: mock(), success: mock() },
}));

mock.module("@/shared/lib/pricing/format", () => ({
  formatPrice: (value: number) => `${value}円`,
}));

mock.module("@/admin/components/status-badges", () => ({
  CustomerIdentityBadge: () => <span>member</span>,
  ReservationStatusBadge: ({ status }: { status: string }) => (
    <span>{status}</span>
  ),
}));

mock.module("@/admin/components/DetailSection", () => ({
  DetailSection: ({
    title,
    children,
  }: {
    title: string;
    children?: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

mock.module("@/admin/components/DetailField", () => ({
  DetailField: ({ label, value }: { label: string; value?: ReactNode }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

mock.module("@/admin/components/ui", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button
      type="button"
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
  Input: () => <input />,
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => <span />,
}));

mock.module("@/admin/actions/reservation", () => ({
  updateReservationStatus: mock(),
  updateReservationNotes: mock(),
  createCheckoutSession: mock(),
  refundReservationPayment: mock(),
  reissueReservationReceipt: mock(),
  updateCustomerFromReservation: mock(),
}));

mock.module(
  "@/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog",
  () => ({
    RefundDialog: () => null,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RecordManualPaymentDialog",
  () => ({
    RecordManualPaymentDialog: () => null,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReissueReceiptDialog",
  () => ({
    ReissueReceiptDialog: () => null,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/reservations/_components/CancellationReasonDialog",
  () => ({
    CancellationReasonDialog: () => null,
  }),
);

const { ReservationDetail } =
  await import("@/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail");

function makeReservation(
  overrides: Partial<ReservationWithRelations> = {},
): ReservationWithRelations {
  return {
    id: "0ae79d2e-f316-470a-8709-9c27e8c5fe6a",
    spaceId: "de8ba330-cdc1-402e-8f5f-d506f34bf00a",
    customerId: "9d21f315-2637-4dad-8dad-ff692fc90b3a",
    startTime: "2026-08-01T01:00:00.000Z",
    endTime: "2026-08-01T03:00:00.000Z",
    status: ReservationStatus.CONFIRMED,
    version: 1,
    totalPrice: 10000,
    basePrice: null,
    couponId: null,
    couponDiscountAmount: null,
    durationDiscountAmount: null,
    spaceDiscountAmount: null,
    taxRateType: null,
    taxRate: null,
    taxAmount: null,
    totalPriceWithTax: 11000,
    notes: null,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    paymentStatus: PaymentStatus.UNPAID,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledByType: null,
    guestLastName: null,
    guestFirstName: null,
    guestEmail: null,
    guestPhone: null,
    guestCompanyName: null,
    guestCustomerType: null,
    space: { id: "de8ba330-cdc1-402e-8f5f-d506f34bf00a", name: "Studio A" },
    customer: {
      id: "9d21f315-2637-4dad-8dad-ff692fc90b3a",
      firstName: "太郎",
      lastName: "山田",
      companyName: null,
      email: "taro@example.com",
      phoneNumber: null,
      userId: null,
    },
    refunds: [],
    ...overrides,
  };
}

function buttonLabels(container: HTMLDivElement | undefined): string[] {
  return [...(container?.querySelectorAll("button") ?? [])].map(
    (button) => button.textContent ?? "",
  );
}

describe("ReservationDetail payment actions", () => {
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

  async function renderDetail(
    reservation: ReservationWithRelations,
    paymentEnabled: boolean,
  ) {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <ReservationDetail
          reservation={reservation}
          paymentEnabled={paymentEnabled}
          suggestedRefundAmount={null}
        />,
      );
    });
  }

  test("payment OFF + UNPAID: 決済リンク非表示、手動入金のみ表示", async () => {
    await renderDetail(makeReservation(), false);

    const labels = buttonLabels(container);
    expect(labels.some((label) => label.includes("決済リンクを作成"))).toBe(
      false,
    );
    expect(labels.some((label) => label.includes("手動入金記録"))).toBe(true);
    expect(container?.textContent).toContain(
      "オンライン決済は無効です。銀行振込等の入金を受けたら手動入金を記録してください。",
    );
    expect(container?.textContent).not.toContain("機能モジュール");
  });

  test("payment ON + UNPAID: 決済リンクと手動入金の両方を表示", async () => {
    await renderDetail(makeReservation(), true);

    const labels = buttonLabels(container);
    expect(labels.some((label) => label.includes("決済リンクを作成"))).toBe(
      true,
    );
    expect(labels.some((label) => label.includes("手動入金記録"))).toBe(true);
  });

  test("payment OFF + Stripe PAID: Stripe 履歴があるときだけ返金ボタン表示", async () => {
    await renderDetail(
      makeReservation({
        paymentStatus: PaymentStatus.PAID,
        stripePaymentIntentId: "pi_test_123",
        paidAt: "2026-07-02T00:00:00.000Z",
      }),
      false,
    );

    const labels = buttonLabels(container);
    expect(labels.some((label) => label.includes("返金する"))).toBe(true);
    expect(labels.some((label) => label.includes("決済リンクを作成"))).toBe(
      false,
    );
  });

  test("payment OFF + 手動 PAID: Stripe 履歴なしなら返金ボタン非表示", async () => {
    await renderDetail(
      makeReservation({
        paymentStatus: PaymentStatus.PAID,
        stripePaymentIntentId: null,
        paidAt: "2026-07-02T00:00:00.000Z",
      }),
      false,
    );

    const labels = buttonLabels(container);
    expect(labels.some((label) => label.includes("返金する"))).toBe(false);
  });

  test("UNPAID + stripeCheckoutSessionId あり: 手動入金非表示", async () => {
    await renderDetail(
      makeReservation({
        stripeCheckoutSessionId: "cs_test_123",
      }),
      false,
    );

    const labels = buttonLabels(container);
    expect(labels.some((label) => label.includes("手動入金記録"))).toBe(false);
  });

  test("CANCELLED: キャンセル日時を JST 整形で表示する（UTC 生 ISO を出さない）", async () => {
    // UTC 2026-08-15 20:00 → JST 2026-08-16 05:00（日跨ぎするので UTC 表示なら 08/15 のまま）
    await renderDetail(
      makeReservation({
        status: ReservationStatus.CANCELLED,
        cancelledAt: "2026-08-15T20:00:00.000Z",
      }),
      false,
    );

    const text = container?.textContent ?? "";
    expect(text).toContain("2026/08/16");
    expect(text).not.toContain("2026-08-15T20:00:00.000Z");
  });
});
