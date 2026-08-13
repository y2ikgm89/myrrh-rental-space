/**
 * @description `EventRegistrationTable` の「一括操作は可視行だけを対象にする」回帰テスト。
 *
 * `selectedIds` はローカル state なので、検索・絞り込み・ページ移動で
 * `registrations` が入れ替わっても残り続ける。そのまま一括操作へ渡すと、
 * 画面に見えていない過去選択の申込まで対象になる。一括キャンセルは
 * Stripe 返金・繰り上げ当選・参加者への通知メールを発火するため、
 * 見えない行が混ざると取り返しがつかない。
 *
 * 他の管理テーブル（PostTable / CouponTable 等）は可視 id との積集合を渡す
 * 実装になっていたが、このテーブルだけ `[...selectedIds]` を素通ししていた。
 *
 * 一括操作バーは stub 化し、**受け取った `selectedIds`** をそのまま描画して
 * 検証する（バーの見た目ではなく「何が渡るか」が本題のため）。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("sonner", () => ({
  toast: { success: mock(() => undefined), error: mock(() => undefined) },
  Toaster: () => null,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock(() => undefined) }),
}));

// nuqs は adapter context 前提なので stub。このテストは URL state を触らない。
// mock.module は完全置換なので、import graph 内で使われている export を
// 全部生やす（欠けると SyntaxError: Export named ... not found）。
type ParserStub = {
  withDefault: (value: unknown) => ParserStub;
  withOptions: (options: unknown) => ParserStub;
};
function parserStub(): ParserStub {
  const stub: ParserStub = {
    withDefault: () => stub,
    withOptions: () => stub,
  };
  return stub;
}

mock.module("nuqs", () => ({
  useQueryStates: () => [{ search: "", status: null, page: 1 }, mock(() => {})],
  useQueryState: () => [null, mock(() => {})],
  parseAsStringLiteral: parserStub,
  parseAsString: parserStub(),
  parseAsInteger: parserStub(),
  debounce: (value: unknown) => value,
}));

mock.module("@/admin/hooks", () => ({
  useDebouncedCallback: (fn: (value: string) => void) => fn,
}));

mock.module("@/admin/actions/event-registration", () => ({
  adminCancelRegistration: mock(() => Promise.resolve({})),
  createEventCheckoutSession: mock(() => Promise.resolve({})),
  refundEventRegistrationPayment: mock(() => Promise.resolve({})),
}));

mock.module("@/admin/lib/open-external-tab", () => ({
  openExternalTab: mock(() => undefined),
}));

// 行内ダイアログは本題ではない。
mock.module(
  "@/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog",
  () => ({ RefundDialog: () => null }),
);
mock.module(
  "@/app/(admin)/admin/(dashboard)/events/[id]/_components/EditRegistrationDialog",
  () => ({ EditRegistrationDialog: () => null }),
);
mock.module(
  "@/app/(admin)/admin/(dashboard)/events/[id]/_components/RecordManualPaymentDialog",
  () => ({ RecordManualPaymentDialog: () => null }),
);

// 一括操作バーの stub: 受け取った selectedIds をそのまま出す。
mock.module(
  "@/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationBulkActions",
  () => ({
    EventRegistrationBulkActions: ({
      selectedIds,
    }: {
      selectedIds: string[];
    }): ReactNode => (
      <div data-testid="bulk-target">{selectedIds.join(",")}</div>
    ),
  }),
);

const { EventRegistrationTable } =
  await import("@/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable");

type Registration = Parameters<
  typeof EventRegistrationTable
>[0]["registrations"][number];

function registration(id: string, name: string): Registration {
  return {
    id,
    name,
    email: `${id}@example.com`,
    phone: null,
    note: null,
    quantity: 1,
    status: "CONFIRMED",
    paymentStatus: "UNPAID",
    paidAmount: null,
    stripePaymentIntentId: null,
    stripeCheckoutSessionId: null,
    cumulativeRefunded: 0,
    cancelledAt: null,
    attendedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    slotStartAt: "2026-09-01T01:00:00.000Z",
    slotEndAt: "2026-09-01T03:00:00.000Z",
  };
}

const PAGE_1 = [
  registration("reg-a", "A さん"),
  registration("reg-b", "B さん"),
];
const PAGE_2 = [registration("reg-c", "C さん")];

let container: HTMLDivElement;
let root: Root;

function renderWith(registrations: Registration[]): void {
  act(() => {
    root.render(
      <EventRegistrationTable
        eventId="event-1"
        registrations={registrations}
        total={3}
        currentPage={1}
        perPage={2}
        paymentEnabled={false}
      />,
    );
  });
}

function bulkTarget(): string {
  return (
    container.querySelector('[data-testid="bulk-target"]')?.textContent ?? ""
  );
}

/** 行チェックボックス（先頭は「全選択」なので 1 始まり）。 */
function rowCheckboxes(): HTMLInputElement[] {
  return [
    ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ].slice(1);
}

beforeEach(() => {
  installJSDOMForTests();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("EventRegistrationTable の一括操作対象", () => {
  test("選択した行がページ移動で見えなくなったら、一括操作の対象から外れる", () => {
    renderWith(PAGE_1);
    for (const box of rowCheckboxes()) {
      act(() => box.click());
    }
    expect(bulkTarget()).toBe("reg-a,reg-b");

    // ページ移動 = registrations が入れ替わる。selectedIds は state に残るが、
    // 一括操作へ渡るのは可視 id との積集合だけ。
    renderWith(PAGE_2);
    expect(bulkTarget()).toBe("");
  });

  test("戻ってきたら元の選択が生きている（積集合であって破棄ではない）", () => {
    renderWith(PAGE_1);
    act(() => rowCheckboxes()[0]?.click());
    expect(bulkTarget()).toBe("reg-a");

    renderWith(PAGE_2);
    expect(bulkTarget()).toBe("");

    renderWith(PAGE_1);
    expect(bulkTarget()).toBe("reg-a");
  });
});
