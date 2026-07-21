/**
 * @description `LexicalMountErrorBoundary`（副防御）のテスト。
 *
 * 主防御をすり抜けた未知の例外（子コンポーネントの同期 throw）が
 * 共有 (dashboard)/error.tsx まで伝播せずこの境界で吸収されること、
 * best-effort で未登録 node type を文言に反映すること、
 * リセット後は世代カウンタの key で children を強制的に再マウントすることを検証する。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const confirmMock = mock(async (_options: unknown) => true);
mock.module("@/admin/contexts/confirm-context", () => ({
  useConfirm: () => confirmMock,
}));

mock.module("sonner", () => ({
  toast: { success: mock(() => undefined), error: mock(() => undefined) },
  // @/admin/components/ui バレル経由で toaster.tsx が named import する。
  Toaster: () => null,
}));

const { LexicalMountErrorBoundary } =
  await import("@/admin/components/editor/lexical/LexicalMountErrorBoundary");
const { EMPTY_LEXICAL_EDITOR_STATE_JSON } =
  await import("@/shared/lib/validations/lexical");

/** root 直下の唯一の子が未登録 type（componentDidCatch の best-effort diff 対象） */
const SOLE_CHILD_UNKNOWN_JSON = JSON.stringify({
  root: {
    children: [{ type: "totally-unknown-widget", version: 1 }],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

let shouldThrow = true;
let mountCount = 0;

function Thrower() {
  mountCount += 1;
  if (shouldThrow) {
    throw new Error("boom: simulated unexpected mount error");
  }
  return <div data-testid="recovered">recovered</div>;
}

describe("LexicalMountErrorBoundary", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  // React の開発時デフォルト挙動: Error Boundary が catch した後も
  // 該当エラーを console.error に出力する（正常な仕様、テスト失敗ではない）。
  const originalConsoleError = console.error;

  beforeEach(() => {
    installJSDOMForTests();
    confirmMock.mockClear();
    confirmMock.mockImplementation(async () => true);
    shouldThrow = true;
    mountCount = 0;
    console.error = () => undefined;
  });

  afterEach(() => {
    console.error = originalConsoleError;
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("子コンポーネントの同期 throw を吸収し、Notice を表示する（伝播しない）", () => {
    const onChange = mock((_json: string) => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    expect(() => {
      act(() => {
        localRoot.render(
          <LexicalMountErrorBoundary
            contentJson={SOLE_CHILD_UNKNOWN_JSON}
            onChange={onChange}
          >
            <Thrower />
          </LexicalMountErrorBoundary>,
        );
      });
    }).not.toThrow();

    expect(container.textContent).toContain("本文を読み込めません");
    // componentDidCatch の best-effort diff が原因の node type を文言に反映する
    expect(container.textContent).toContain("totally-unknown-widget");
  });

  test("リセット後は generation key で children を強制的に再マウントし、回復した children を表示する", async () => {
    const onChange = mock((_json: string) => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    act(() => {
      localRoot.render(
        <LexicalMountErrorBoundary
          contentJson={SOLE_CHILD_UNKNOWN_JSON}
          onChange={onChange}
        >
          <Thrower />
        </LexicalMountErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("本文を読み込めません");
    const mountCountAfterCrash = mountCount;

    // リセット操作: 以後 Thrower は throw しない（原因が解消された想定）
    shouldThrow = false;

    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("リセットして編集を続ける"),
    );
    expect(resetButton).toBeDefined();

    await act(async () => {
      resetButton?.click();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith(EMPTY_LEXICAL_EDITOR_STATE_JSON);
    expect(container.textContent).not.toContain("本文を読み込めません");
    expect(container.querySelector('[data-testid="recovered"]')).not.toBeNull();
    // key の世代カウンタにより children が完全に再マウントされている
    expect(mountCount).toBeGreaterThan(mountCountAfterCrash);
  });
});
