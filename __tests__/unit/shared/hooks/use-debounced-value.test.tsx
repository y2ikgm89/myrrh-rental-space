/**
 * `useDebouncedValue` の挙動。
 *
 * conform の `fields.<name>.value` は打鍵ごとに更新される。そのまま effect の
 * 依存に置くと 1 打鍵ごとに Server Action が飛び、公開クエリのレート上限
 * （60 秒 / 30 リクエスト、IP 単位）を食い潰す（監査 F-39）。
 */

import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const DELAY_MS = 50;

function Probe({
  value,
  onRender,
}: {
  value: string;
  onRender: (debounced: string) => void;
}): ReactElement {
  const debounced = useDebouncedValue(value, DELAY_MS);
  onRender(debounced);
  return <span>{debounced}</span>;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("useDebouncedValue", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

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

  test("連続更新のあいだは初期値のまま、静まってから最後の値になる", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    const seen: string[] = [];
    const render = (value: string) => {
      act(() => {
        localRoot.render(
          <Probe
            value={value}
            onRender={(debounced) => {
              seen.push(debounced);
            }}
          />,
        );
      });
    };

    render("");
    // 「WELCOME」を 1 文字ずつ打つ。旧実装ではここで 7 回 Server Action が飛ぶ。
    for (const partial of [
      "W",
      "WE",
      "WEL",
      "WELC",
      "WELCO",
      "WELCOM",
      "WELCOME",
    ]) {
      render(partial);
    }

    // まだ待ち時間内: 途中の値は 1 つも出ていない。
    expect(seen).not.toContain("W");
    expect(seen).not.toContain("WELCOM");

    await advance(DELAY_MS * 3);

    // 静まったら最後の値だけが出る。
    expect(seen.at(-1)).toBe("WELCOME");
    expect(container.textContent).toBe("WELCOME");
  });

  test("値が変わらなければ何も起きない", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    const seen: string[] = [];
    act(() => {
      localRoot.render(
        <Probe
          value="FIXED"
          onRender={(debounced) => {
            seen.push(debounced);
          }}
        />,
      );
    });

    await advance(DELAY_MS * 3);

    expect(seen.at(-1)).toBe("FIXED");
  });
});
