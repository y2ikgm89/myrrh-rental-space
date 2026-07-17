/**
 * EventCell / EventBadge — series 表示の unit test (Phase B.2 task 22).
 *
 * 検証観点:
 *   - seriesId 未指定なら「定期」バッジも aria-label 追加も無い
 *   - seriesId + recurrenceInstanceIndex + seriesInstanceCount あり →
 *     「定期」バッジ表示 + aria-label に「定期予約 3 回目 / 全 10 回」を含む
 *   - EventBadge (月ビュー) でも同じマーカー
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  EventCell,
  EventBadge,
} from "@/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventCell";
import type {
  CalendarEvent,
  PositionedEvent,
} from "@/app/(admin)/admin/(dashboard)/_shared/lib/calendar/calendar-types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const BASE_EVENT: CalendarEvent = {
  id: "r1",
  title: "山田様の予約",
  spaceId: "s1",
  spaceName: "Studio A",
  startTime: "2027-05-04T10:00:00.000Z",
  endTime: "2027-05-04T12:00:00.000Z",
  status: "CONFIRMED",
  totalPrice: 5000,
  notes: null,
  customerName: "山田 太郎",
  customerEmail: "yamada@example.com",
  customerPhone: null,
};

const POSITION = { top: 0, height: 60, left: 0, width: 100, zIndex: 1 };

async function renderNode(node: React.ReactNode): Promise<void> {
  await act(async () => root?.render(node));
}

describe("EventCell / EventBadge — Phase B.2 task 22 series marker", () => {
  test("seriesId 未指定なら「定期」バッジは出ない", async () => {
    const positioned: PositionedEvent = { ...BASE_EVENT, position: POSITION };
    await renderNode(<EventCell event={positioned} onClick={() => {}} />);

    expect(container?.textContent ?? "").not.toContain("定期");
  });

  test("seriesId 指定で「定期」バッジ表示 + aria-label に series 情報", async () => {
    const positioned: PositionedEvent = {
      ...BASE_EVENT,
      seriesId: "series-abc",
      recurrenceInstanceIndex: 2,
      seriesInstanceCount: 10,
      position: POSITION,
    };
    await renderNode(<EventCell event={positioned} onClick={() => {}} />);

    expect(container?.textContent ?? "").toContain("定期");
    const button = container?.querySelector("button");
    const aria = button?.getAttribute("aria-label") ?? "";
    expect(aria).toContain("定期予約");
    expect(aria).toContain("3"); // 0-based index 2 → 1-based 3 回目
    expect(aria).toContain("10");
  });

  test("EventBadge (月ビュー) でも series 指定で「定期」バッジ表示", async () => {
    const event: CalendarEvent = {
      ...BASE_EVENT,
      seriesId: "series-xyz",
      recurrenceInstanceIndex: 0,
      seriesInstanceCount: 5,
    };
    await renderNode(<EventBadge event={event} onClick={() => {}} />);

    expect(container?.textContent ?? "").toContain("定期");
    const button = container?.querySelector("button");
    const aria = button?.getAttribute("aria-label") ?? "";
    expect(aria).toContain("定期予約");
    expect(aria).toContain("1");
    expect(aria).toContain("5");
  });

  test("recurrenceInstanceIndex 欠落時は「定期予約」のみ (N 回目 は付けない)", async () => {
    const positioned: PositionedEvent = {
      ...BASE_EVENT,
      seriesId: "series-abc",
      recurrenceInstanceIndex: null,
      position: POSITION,
    };
    await renderNode(<EventCell event={positioned} onClick={() => {}} />);

    const aria =
      container?.querySelector("button")?.getAttribute("aria-label") ?? "";
    expect(aria).toContain("定期予約");
    expect(aria).not.toContain("回目");
  });
});
