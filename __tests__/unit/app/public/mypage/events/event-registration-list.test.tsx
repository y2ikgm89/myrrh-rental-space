/**
 * MYPAGE-EVENT-01 regression test — mypage の EventRegistrationList が
 * オンラインイベントの `meetingUrl` を無条件に描画してしまう content bypass の
 * 修正を pin する。
 *
 * 要件:
 * - `status === "CONFIRMED"` かつ format ∈ {ONLINE, HYBRID} かつ meetingUrl 有り
 *   の場合のみ、参加 URL の <a href> を DOM に含める。
 * - WAITLISTED / WAITLISTED_OFFERED / CANCELLED / EXPIRED の場合、meetingUrl
 *   を含む <a> リンクは DOM に一切出さず、「参加確定後に表示されます」等の
 *   placeholder のみを描画する（WAITLISTED_OFFERED は 24h 期限内でも「確定前」
 *   なので露出しないのが正）。
 * - OFFLINE の場合は format 側で isEventVirtualAccessible が false のため
 *   status に関係なく URL 行は出ない。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installJSDOMForTests } from "../../../../../setup-dom";
import { definite } from "../../../../../support/definite";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// Mocks — 描画本質でない副作用や外部 UI を no-op / minimum stub 化する。
// design-system は shallow stub にとどめ、business logic
// (isEventVirtualAccessible / RegistrationStatus enum 等) は本物を使う。
// ---------------------------------------------------------------------------

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

mock.module("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children?: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

mock.module("@/public/actions/event-registration", () => ({
  cancelEventRegistration: mock(async () => ({ ok: true }) as const),
}));

mock.module("@/public/components/design-system/stack", () => ({
  Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

mock.module("@/public/components/design-system/badge", () => ({
  Badge: ({
    children,
    variant,
    className,
  }: {
    children?: ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

mock.module("@/public/components/design-system/button", () => ({
  Button: ({
    children,
    onClick,
    href,
    disabled,
    className,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    className?: string;
    variant?: string;
    size?: string;
  }) =>
    href ? (
      <a href={href} className={className}>
        {children}
      </a>
    ) : (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={className}
      >
        {children}
      </button>
    ),
}));

mock.module("@/public/components/design-system/dialog", () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
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
}));

mock.module("@/public/lib/format-event-date", () => ({
  formatEventDateTimeRange: (start: string, end: string) =>
    `range:${start}-${end}`,
}));

mock.module("@/app/(public)/_shared/components/ui/add-to-calendar", () => ({
  AddToCalendar: () => <div data-testid="add-to-calendar" />,
}));

mock.module("@/shared/components/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
}));

mock.module("@/shared/lib/turnstile-actions", () => ({
  TURNSTILE_ACTIONS: {
    mypage_event_registration_cancel: "mypage_event_registration_cancel",
  },
}));

mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

mock.module("@/shared/lib/ical/urls", () => ({
  buildAddToCalendarUrls: () => ({}),
}));

mock.module(
  "@/app/(public)/mypage/events/_components/event-checkout-button",
  () => ({
    EventCheckoutButton: () => <div data-testid="event-checkout-button" />,
  }),
);

mock.module("@/app/(public)/mypage/_shared/actions/event-registration", () => ({
  startEventCheckoutSessionAction: mock(async () => ({ sessionUrl: null })),
}));

// ---------------------------------------------------------------------------
// SUT dynamic import (mocks must be registered first)
// ---------------------------------------------------------------------------

const { EventRegistrationList } =
  await import("@/app/(public)/mypage/events/_components/event-registration-list");
type EventRegistrationListItem = React.ComponentProps<
  typeof EventRegistrationList
>["registrations"][number];

const MEETING_URL = "https://zoom.us/j/meeting-secret-1234567890";

function makeRegistration(
  overrides: Partial<EventRegistrationListItem> = {},
): EventRegistrationListItem {
  return {
    id: "60e01261-0546-4528-8a03-68d37a9d9568",
    quantity: 1,
    status: "CONFIRMED",
    cancelledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    waitlistedAt: null,
    offeredAt: null,
    expiresAt: null,
    paymentStatus: "UNPAID",
    ticketUnitPrice: 3000,
    ticketTotalPrice: 3000,
    slotId: "cf43a8ed-8e86-4c86-8a1c-321178e32c69",
    ticketId: "a61a338d-248c-4045-8c8e-552285098d90",
    ...overrides,
    event: {
      id: "e1bc47d2-1310-46d8-889b-ff7bdf8726f2",
      title: "オンライン勉強会",
      slug: "online-workshop",
      startTime: "2026-08-01T01:00:00.000Z",
      endTime: "2026-08-01T02:00:00.000Z",
      location: null,
      status: "PUBLISHED",
      format: "ONLINE",
      meetingUrl: MEETING_URL,
      ...(overrides.event ?? {}),
    },
  };
}

describe("EventRegistrationList / meetingUrl gate (MYPAGE-EVENT-01)", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
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

  function renderList(registration: EventRegistrationListItem): void {
    if (!root) throw new Error("root missing");
    act(() => {
      root?.render(
        <EventRegistrationList
          registrations={[registration]}
          emptyMessage="申込はありません"
          turnstileSiteKey={null}
          nowIso="2026-07-01T00:00:00.000Z"
          receiptSerialNoMap={{}}
          waitlistPositionMap={{}}
          paymentEnabled={false}
        />,
      );
    });
  }

  function meetingUrlLink(): HTMLAnchorElement | null {
    if (!container) return null;
    const links = container.querySelectorAll<HTMLAnchorElement>(
      `a[href="${MEETING_URL}"]`,
    );
    return links.length > 0 ? definite(links[0], "links[0]") : null;
  }

  function detailLink(): HTMLAnchorElement | null {
    if (!container) return null;
    return container.querySelector<HTMLAnchorElement>(
      'a[href="/mypage/events/60e01261-0546-4528-8a03-68d37a9d9568"]',
    );
  }

  test("CONFIRMED + ONLINE + meetingUrl 有り → 参加 URL リンクを描画する", () => {
    renderList(makeRegistration({ status: "CONFIRMED" }));
    expect(meetingUrlLink()).not.toBeNull();
    expect(detailLink()?.getAttribute("href")).toBe(
      "/mypage/events/60e01261-0546-4528-8a03-68d37a9d9568",
    );
  });

  test("CONFIRMED + HYBRID + meetingUrl 有り → 参加 URL リンクを描画する", () => {
    renderList(
      makeRegistration({
        status: "CONFIRMED",
        event: {
          id: "e1bc47d2-1310-46d8-889b-ff7bdf8726f2",
          title: "ハイブリッド勉強会",
          slug: "hybrid-workshop",
          startTime: "2026-08-01T01:00:00.000Z",
          endTime: "2026-08-01T02:00:00.000Z",
          location: "会議室 A",
          status: "PUBLISHED",
          format: "HYBRID",
          meetingUrl: MEETING_URL,
        },
      }),
    );
    expect(meetingUrlLink()).not.toBeNull();
  });

  test("WAITLISTED → meetingUrl リンクを描画しない (placeholder のみ)", () => {
    renderList(
      makeRegistration({
        status: "WAITLISTED",
        waitlistedAt: "2026-07-01T00:00:00.000Z",
      }),
    );
    expect(meetingUrlLink()).toBeNull();
    expect(container?.textContent ?? "").toContain("参加確定後に表示されます");
  });

  test("WAITLISTED_OFFERED → meetingUrl リンクを描画しない (確定前のため非公開)", () => {
    renderList(
      makeRegistration({
        status: "WAITLISTED_OFFERED",
        waitlistedAt: "2026-07-01T00:00:00.000Z",
        offeredAt: "2026-07-15T00:00:00.000Z",
        expiresAt: "2026-07-16T00:00:00.000Z",
      }),
    );
    expect(meetingUrlLink()).toBeNull();
    expect(container?.textContent ?? "").toContain("参加確定後に表示されます");
  });

  test("CANCELLED → meetingUrl リンクを描画しない", () => {
    renderList(
      makeRegistration({
        status: "CANCELLED",
        cancelledAt: "2026-07-05T00:00:00.000Z",
      }),
    );
    expect(meetingUrlLink()).toBeNull();
  });

  test("EXPIRED → meetingUrl リンクを描画しない", () => {
    renderList(
      makeRegistration({
        status: "EXPIRED",
        waitlistedAt: "2026-07-01T00:00:00.000Z",
        offeredAt: "2026-07-15T00:00:00.000Z",
        expiresAt: "2026-07-16T00:00:00.000Z",
      }),
    );
    expect(meetingUrlLink()).toBeNull();
  });

  test("OFFLINE + meetingUrl 有りっぽく偽装しても isEventVirtualAccessible=false のため URL 行は出さない", () => {
    renderList(
      makeRegistration({
        status: "CONFIRMED",
        event: {
          id: "e1bc47d2-1310-46d8-889b-ff7bdf8726f2",
          title: "オフラインイベント",
          slug: "offline",
          startTime: "2026-08-01T01:00:00.000Z",
          endTime: "2026-08-01T02:00:00.000Z",
          location: "会議室 A",
          status: "PUBLISHED",
          format: "OFFLINE",
          meetingUrl: MEETING_URL,
        },
      }),
    );
    expect(meetingUrlLink()).toBeNull();
    expect(container?.textContent ?? "").not.toContain(
      "参加確定後に表示されます",
    );
  });

  test("ONLINE + meetingUrl null → 何も出さない (placeholder も出さない)", () => {
    renderList(
      makeRegistration({
        status: "WAITLISTED",
        waitlistedAt: "2026-07-01T00:00:00.000Z",
        event: {
          id: "e1bc47d2-1310-46d8-889b-ff7bdf8726f2",
          title: "オンライン (URL 未発行)",
          slug: "online-no-url",
          startTime: "2026-08-01T01:00:00.000Z",
          endTime: "2026-08-01T02:00:00.000Z",
          location: null,
          status: "PUBLISHED",
          format: "ONLINE",
          meetingUrl: null,
        },
      }),
    );
    expect(meetingUrlLink()).toBeNull();
    expect(container?.textContent ?? "").not.toContain(
      "参加確定後に表示されます",
    );
  });
});
