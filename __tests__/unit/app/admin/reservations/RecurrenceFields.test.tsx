/**
 * `RecurrenceFields` + `RecurrencePreview` component tests (Phase B.2 task 19).
 *
 * project convention: `react-dom/client` `createRoot` + JSDOM preload
 * (`__tests__/setup-dom.ts`).
 *
 * 検証観点:
 *   - initial state で freq/interval/byday/count/until 4 系統の DOM 要素が render される
 *   - WEEKLY 時のみ BYDAY checkbox が表示される (DAILY/MONTHLY では非表示)
 *   - endMode=count → count input、endMode=until → date input の toggling
 *   - `RecurrencePreview` が freq+byday+count/until から人間可読 string を生成する
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  type Mock,
  mock,
} from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  RecurrenceFields,
  type RecurrenceState,
} from "@/app/(admin)/admin/(dashboard)/reservations/_components/RecurrenceFields";
import { RecurrencePreview } from "@/app/(admin)/admin/(dashboard)/reservations/_components/RecurrencePreview";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

function byId<T extends Element = HTMLElement>(id: string): T | null {
  return container?.querySelector<T>(`#${id}`) ?? null;
}

async function renderNode(node: React.ReactNode): Promise<void> {
  await act(async () => {
    root?.render(node);
  });
}

// ---------------------------------------------------------------------------
// RecurrenceFields
// ---------------------------------------------------------------------------

const INITIAL_STATE: RecurrenceState = {
  freq: "WEEKLY",
  interval: 1,
  byday: ["TU"],
  endMode: "count",
  count: 10,
  until: "",
};

describe("RecurrenceFields — Phase B.2 task 19", () => {
  test("初期 render で freq select + interval input + BYDAY checkboxes + count input が並ぶ", async () => {
    const onChange = mock<(next: RecurrenceState) => void>();
    await renderNode(
      <RecurrenceFields value={INITIAL_STATE} onChange={onChange} />,
    );

    expect(byId("recurrence-freq")).not.toBeNull();
    expect(byId("recurrence-interval")).not.toBeNull();
    expect(byId("recurrence-byday-tu")).not.toBeNull();
    expect(byId("recurrence-count")).not.toBeNull();
  });

  test("freq=DAILY なら BYDAY checkboxes が非表示、freq=MONTHLY でも非表示", async () => {
    const onChange = mock<(next: RecurrenceState) => void>();
    await renderNode(
      <RecurrenceFields
        value={{ ...INITIAL_STATE, freq: "DAILY" }}
        onChange={onChange}
      />,
    );
    expect(byId("recurrence-byday-tu")).toBeNull();

    await renderNode(
      <RecurrenceFields
        value={{ ...INITIAL_STATE, freq: "MONTHLY" }}
        onChange={onChange}
      />,
    );
    expect(byId("recurrence-byday-tu")).toBeNull();
  });

  test("BYDAY checkbox クリックで onChange が byday を追加する", async () => {
    const onChange: Mock<(next: RecurrenceState) => void> = mock(() => {});
    await renderNode(
      <RecurrenceFields value={INITIAL_STATE} onChange={onChange} />,
    );

    const th = byId<HTMLInputElement>("recurrence-byday-th");
    expect(th).not.toBeNull();
    await act(async () => th?.click());

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(lastCall?.byday).toContain("TU");
    expect(lastCall?.byday).toContain("TH");
  });

  test("interval の change で onChange が呼ばれる", async () => {
    const onChange: Mock<(next: RecurrenceState) => void> = mock(() => {});
    await renderNode(
      <RecurrenceFields value={INITIAL_STATE} onChange={onChange} />,
    );

    const interval = byId<HTMLInputElement>("recurrence-interval");
    expect(interval).not.toBeNull();
    // React 制御下 input の programmatic 変更: native setter で value を書換えてから
    // input event を dispatch する (React は元 setter を差替えて change 検知する)。
    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      if (interval) {
        nativeInputSetter?.call(interval, "3");
        interval.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(lastCall?.interval).toBe(3);
  });

  test("endMode=until を選ぶと date input が表示され count input が消える", async () => {
    const onChange = mock<(next: RecurrenceState) => void>();
    await renderNode(
      <RecurrenceFields
        value={{ ...INITIAL_STATE, endMode: "until", until: "2027-09-01" }}
        onChange={onChange}
      />,
    );

    expect(byId("recurrence-until")).not.toBeNull();
    expect(byId("recurrence-count")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RecurrencePreview
// ---------------------------------------------------------------------------

describe("RecurrencePreview — Phase B.2 task 19", () => {
  test("WEEKLY BYDAY=TU,TH COUNT=10 → 「毎週 火/木 (10 回)」に該当する語句を含む", async () => {
    await renderNode(
      <RecurrencePreview
        state={{
          freq: "WEEKLY",
          interval: 1,
          byday: ["TU", "TH"],
          endMode: "count",
          count: 10,
          until: "",
        }}
        dtstart={new Date("2027-05-04T10:00:00.000Z")}
      />,
    );

    const text = container?.textContent ?? "";
    expect(text).toContain("毎週");
    expect(text).toContain("火");
    expect(text).toContain("木");
    expect(text).toContain("10");
  });

  test("DAILY INTERVAL=2 UNTIL=2027-09-01 → 「2 日ごと」「2027-09-01」を含む", async () => {
    await renderNode(
      <RecurrencePreview
        state={{
          freq: "DAILY",
          interval: 2,
          byday: [],
          endMode: "until",
          count: 0,
          until: "2027-09-01",
        }}
        dtstart={new Date("2027-05-04T10:00:00.000Z")}
      />,
    );

    const text = container?.textContent ?? "";
    expect(text).toContain("2");
    expect(text).toContain("日");
    expect(text).toContain("2027-09-01");
  });

  test("MONTHLY COUNT=6 → 「毎月」「6」を含む", async () => {
    await renderNode(
      <RecurrencePreview
        state={{
          freq: "MONTHLY",
          interval: 1,
          byday: [],
          endMode: "count",
          count: 6,
          until: "",
        }}
        dtstart={new Date("2027-05-04T10:00:00.000Z")}
      />,
    );

    const text = container?.textContent ?? "";
    expect(text).toContain("毎月");
    expect(text).toContain("6");
  });

  test("開始日 (dtstart) を JST 年月日で表示する", async () => {
    await renderNode(
      <RecurrencePreview
        state={{
          freq: "WEEKLY",
          interval: 1,
          byday: ["FR"],
          endMode: "count",
          count: 4,
          until: "",
        }}
        dtstart={new Date("2027-05-04T01:00:00.000Z")}
      />,
    );

    const text = container?.textContent ?? "";
    expect(text).toContain("2027");
    expect(text).toContain("5");
  });
});
