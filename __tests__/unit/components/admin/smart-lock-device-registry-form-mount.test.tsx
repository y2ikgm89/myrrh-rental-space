/**
 * SmartLockDeviceDialog の custom control が Radix Portal 遅延 mount で
 * `form#smart-lock-device-registry-create` を見失う regression。
 *
 * Radix Portal は `useState(false)` + layout effect で children を 1 render
 * 遅らせる。旧 `useInputControl` は mount effect で
 * `document.forms.namedItem(formId)` を探し、見つからないと
 * 「useInputControl is unable to find form#… and identify if a dummy input is
 * required」と warn して return する。
 *
 * 現行は `useFieldControl`（form を参照しない）+ FormBody を DialogContent の
 * 子に置く。このテストは旧 warn 文字列が再発しないことを固定する。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as typeof ResizeObserver;

if (typeof globalThis.InputEvent === "undefined") {
  globalThis.InputEvent = class InputEvent extends Event {
    constructor(type: string, eventInitDict?: EventInit) {
      super(type, eventInitDict);
    }
  } as unknown as typeof InputEvent;
}

mock.module("next/navigation", () => ({
  notFound: mock(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: mock(),
  useRouter: () => ({ push: mock(), refresh: mock() }),
}));

mock.module("sonner", () => ({
  toast: { error: mock(), success: mock() },
}));

mock.module("@/admin/actions/smart-lock-devices", () => ({
  createSmartLockDevice: mock(async () => undefined),
  updateSmartLockDevice: mock(async () => undefined),
  deleteSmartLockDevice: mock(async () => ({ ok: true })),
  toggleSmartLockDeviceActive: mock(async () => ({ ok: true })),
  refreshSmartLockDeviceState: mock(async () => ({ ok: true })),
}));

import { SmartLockDeviceRegistry } from "@/admin/components/SmartLockDeviceRegistry";

const CONFORM_FORM_WARN =
  /useInputControl is unable to find form#smart-lock-device-registry-create/;

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

async function renderNode(node: React.ReactNode): Promise<void> {
  await act(async () => root?.render(node));
}

async function collectConformFormWarnings(
  run: () => Promise<void>,
): Promise<string[]> {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (CONFORM_FORM_WARN.test(text)) warnings.push(text);
  };
  try {
    await run();
    return warnings;
  } finally {
    console.warn = originalWarn;
  }
}

describe("SmartLockDeviceRegistry create dialog form mount", () => {
  test("デバイス追加 Dialog を開いても useInputControl が form を見失わない", async () => {
    const warnings = await collectConformFormWarnings(async () => {
      await renderNode(
        <StrictMode>
          <SmartLockDeviceRegistry
            devices={[]}
            availableLocations={[{ id: "loc-1", name: "本店" }]}
          />
        </StrictMode>,
      );

      const addButton =
        window.document.querySelector<HTMLButtonElement>("button");
      expect(addButton?.textContent).toContain("デバイスを追加");
      await act(async () => {
        addButton?.click();
      });
    });

    expect(
      window.document.forms.namedItem("smart-lock-device-registry-create"),
    ).not.toBeNull();
    expect(warnings).toEqual([]);
  });
});
