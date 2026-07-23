import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

/**
 * Radix Select は jsdom でポインタ操作を再現できないため、この codebase の
 * 既存パターン（refund-dialog.test.tsx 等）に倣い、Select を「クリックで
 * onValueChange(固定id) を呼ぶボタン」に差し替えてテストする。
 */
mock.module("@/admin/components/ui", () => ({
  Label: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <label {...props}>{children}</label>,
  Select: ({
    children,
    onValueChange,
    disabled,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }) => (
    <div>
      <button
        type="button"
        data-testid="select-cancel-policy"
        disabled={disabled}
        onClick={() => onValueChange?.("cancel-policy")}
      >
        select-cancel-policy
      </button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectGroup: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => <span />,
}));

const { FaqItemTemplateSelect } =
  await import("@/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTemplateSelect");
const { FAQ_ITEM_TEMPLATE_GROUPS, FAQ_ITEM_TEMPLATES } =
  await import("@/app/(admin)/admin/(dashboard)/faq/_components/faq-item-templates");

describe("FaqItemTemplateSelect", () => {
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

  test("グループ見出しが FAQ_ITEM_TEMPLATE_GROUPS の順で表示される", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(<FaqItemTemplateSelect onSelect={mock()} />);
    });

    const text = container?.textContent ?? "";
    const positions = FAQ_ITEM_TEMPLATE_GROUPS.map((group) =>
      text.indexOf(group),
    );
    for (const pos of positions) {
      expect(pos).toBeGreaterThanOrEqual(0);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("雛形を選択すると onSelect が対応する FaqItemTemplate で呼ばれる", async () => {
    const onSelect = mock();
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(<FaqItemTemplateSelect onSelect={onSelect} />);
    });

    const button = container?.querySelector(
      '[data-testid="select-cancel-policy"]',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    const expected = FAQ_ITEM_TEMPLATES.find((t) => t.id === "cancel-policy");
    expect(onSelect).toHaveBeenCalledWith(expected);
  });

  test("disabled=true のとき Select が disabled になる", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(<FaqItemTemplateSelect onSelect={mock()} disabled />);
    });

    const button = container?.querySelector(
      '[data-testid="select-cancel-policy"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
