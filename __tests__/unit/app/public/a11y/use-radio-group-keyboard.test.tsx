/**
 * `useRadioGroupKeyboard` hook の keyboard interaction テスト
 * (A11Y-DIALOGS-01 #10 の回帰防止も兼ねる)。
 *
 * WAI-ARIA APG radio pattern:
 *  - ArrowRight/ArrowDown → 次要素 select + focus (wrap)
 *  - ArrowLeft/ArrowUp    → 前要素 select + focus (wrap)
 *  - Home / End           → 最初 / 最後 の要素 select + focus
 *  - Space                → 現要素 select
 *  - Tab stop はグループで 1 つ (checked or 先頭)
 *
 * 実利用側 (公開: space-selector, 管理: ProxyRegistrationDialog /
 * WalkInDialog) はいずれもこの hook を経由してキーボード操作に対応する。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRadioGroupKeyboard } from "@/app/(public)/_shared/lib/a11y/use-radio-group-keyboard";

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

async function renderNode(node: React.ReactNode): Promise<void> {
  await act(async () => {
    root?.render(node);
  });
}

// ---------------------------------------------------------------------------
// Test harness component: 3 button radio group
// ---------------------------------------------------------------------------

interface Item {
  id: string;
  label: string;
}
const ITEMS: readonly Item[] = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" },
];

function Harness({
  initial,
  onSelect,
}: {
  initial: string;
  onSelect: (id: string) => void;
}): React.ReactElement {
  const [selected, setSelected] = useState<string>(initial);
  const { getItemProps } = useRadioGroupKeyboard<
    Item,
    string,
    HTMLButtonElement
  >({
    items: ITEMS,
    selected,
    onSelect: (id) => {
      setSelected(id);
      onSelect(id);
    },
    getKey: (item) => item.id,
  });
  return (
    <div role="radiogroup" aria-label="test">
      {ITEMS.map((item, index) => {
        const isSelected = selected === item.id;
        const itemProps = getItemProps(item, index);
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-id={item.id}
            ref={itemProps.ref}
            tabIndex={itemProps.tabIndex}
            onKeyDown={itemProps.onKeyDown}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function getButtons(): HTMLButtonElement[] {
  return Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button[role="radio"]') ??
      [],
  );
}

function dispatchKey(node: HTMLElement, key: string): void {
  node.dispatchEvent(
    new window.KeyboardEvent("keydown", { key, bubbles: true }),
  );
}

// ---------------------------------------------------------------------------

describe("useRadioGroupKeyboard — A11Y-DIALOGS-01 #10", () => {
  test("初期 render で選択中の要素だけが tabIndex=0 (roving)", async () => {
    const onSelect = mock<(id: string) => void>();
    await renderNode(<Harness initial="b" onSelect={onSelect} />);
    const buttons = getButtons();
    expect(buttons[0]?.tabIndex).toBe(-1);
    expect(buttons[1]?.tabIndex).toBe(0);
    expect(buttons[2]?.tabIndex).toBe(-1);
  });

  test("ArrowRight で次の要素が select され onSelect が発火する", async () => {
    const onSelect = mock<(id: string) => void>();
    await renderNode(<Harness initial="a" onSelect={onSelect} />);
    const buttons = getButtons();
    await act(async () => {
      if (buttons[0]) dispatchKey(buttons[0], "ArrowRight");
    });
    expect(onSelect).toHaveBeenCalledWith("b");
    // roving tabindex が select 追随
    const after = getButtons();
    expect(after[1]?.tabIndex).toBe(0);
    expect(after[0]?.tabIndex).toBe(-1);
  });

  test("ArrowLeft で前の要素が select される", async () => {
    const onSelect = mock<(id: string) => void>();
    await renderNode(<Harness initial="b" onSelect={onSelect} />);
    const buttons = getButtons();
    await act(async () => {
      if (buttons[1]) dispatchKey(buttons[1], "ArrowLeft");
    });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  test("末尾で ArrowRight を押すと先頭に wrap する", async () => {
    const onSelect = mock<(id: string) => void>();
    await renderNode(<Harness initial="c" onSelect={onSelect} />);
    const buttons = getButtons();
    await act(async () => {
      if (buttons[2]) dispatchKey(buttons[2], "ArrowRight");
    });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  test("Home で先頭、End で末尾に飛ぶ", async () => {
    const onSelect = mock<(id: string) => void>();
    await renderNode(<Harness initial="b" onSelect={onSelect} />);
    const buttons = getButtons();
    await act(async () => {
      if (buttons[1]) dispatchKey(buttons[1], "End");
    });
    expect(onSelect).toHaveBeenCalledWith("c");
    await act(async () => {
      const refreshed = getButtons();
      if (refreshed[2]) dispatchKey(refreshed[2], "Home");
    });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  test("Space で focus 中要素が select される (focus は動かさない)", async () => {
    const onSelect = mock<(id: string) => void>();
    await renderNode(<Harness initial="a" onSelect={onSelect} />);
    const buttons = getButtons();
    await act(async () => {
      if (buttons[2]) dispatchKey(buttons[2], " ");
    });
    expect(onSelect).toHaveBeenCalledWith("c");
  });
});
