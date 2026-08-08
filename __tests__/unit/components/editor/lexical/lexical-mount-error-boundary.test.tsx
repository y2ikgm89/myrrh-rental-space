/**
 * @description `LexicalMountErrorBoundary`（副防御）のテスト。
 *
 * 主防御をすり抜けた未知の例外（子コンポーネントの同期 throw）が
 * 共有 (dashboard)/error.tsx まで伝播せずこの境界で吸収されること、
 * `componentDidCatch` 後に `findUnregisteredLexicalNodeTypes` を動的 import して
 * 実際に未登録 node type を検出できた場合のみ破壊的リセットを提示すること
 * （PR#1346 レビュー指摘 P1: 原因不明の例外で正常な本文を誤って消させない）、
 * リセット/再試行後は世代カウンタの key で children を強制的に再マウントする
 * ことを検証する。
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

/** root 直下の唯一の子が未登録 type（動的 import 後の diff で検出される） */
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

/** 未登録 type を含まない、完全に有効な EditorState JSON */
const VALID_EMPTY_JSON = JSON.stringify({
  root: {
    children: [],
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

/**
 * `componentDidCatch` がキックする
 * `await import("./config/registered-node-types")` の解決を待つ。
 * 動的 import 自体の解決タイミングは環境依存のため、固定 1 tick の flush ではなく
 * 期待テキストが現れるまで act 内でポーリングする。
 */
async function waitForText(
  container: HTMLElement,
  text: string,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!container.textContent?.includes(text)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForText timed out after ${timeoutMs}ms waiting for: ${text}`,
      );
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
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

  function renderBoundary(
    contentJson: string,
    onChange: (json: string) => void,
  ): HTMLDivElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;
    act(() => {
      localRoot.render(
        <LexicalMountErrorBoundary
          contentJson={contentJson}
          onChange={onChange}
        >
          <Thrower />
        </LexicalMountErrorBoundary>,
      );
    });
    return el;
  }

  test("未登録 node type を実際に確認できた場合のみ Notice を表示し、破壊的リセットボタンを提示する（伝播しない）", async () => {
    const onChange = mock((_json: string) => undefined);

    expect(() => {
      renderBoundary(SOLE_CHILD_UNKNOWN_JSON, onChange);
    }).not.toThrow();
    const el = container;
    if (!el) throw new Error("container not set");

    // componentDidCatch 直後（動的 import 解決前）は非破壊の汎用フォールバック側
    expect(el.textContent).toContain(
      "エディタの読み込み中にエラーが発生しました",
    );

    await waitForText(el, "本文を読み込めません");

    expect(el.textContent).toContain("totally-unknown-widget");
    const resetButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("リセットして編集を続ける"),
    );
    expect(resetButton).toBeDefined();
  });

  test("未登録 node type が見つからない（原因不明の）例外では汎用フォールバックを表示し、破壊的リセットは提示しない", async () => {
    const onChange = mock((_json: string) => undefined);
    const el = renderBoundary(VALID_EMPTY_JSON, onChange);

    // 検証済み・未登録 type なしに落ち着くまで待つ（"本文を読み込めません" には遷移しない）
    await waitForText(el, "エディタの読み込み中にエラーが発生しました");
    // 動的 import 解決後も同一文言のまま安定していることを確認
    await waitForText(el, "エディタの読み込み中にエラーが発生しました");

    expect(el.textContent).not.toContain("本文を読み込めません");
    const resetButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("リセットして編集を続ける"),
    );
    expect(resetButton).toBeUndefined();
    const retryButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("再試行する"),
    );
    expect(retryButton).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("確認済み破損からのリセット後は generation key で children を強制的に再マウントし、回復した children を表示する", async () => {
    const onChange = mock((_json: string) => undefined);
    const el = renderBoundary(SOLE_CHILD_UNKNOWN_JSON, onChange);
    await waitForText(el, "本文を読み込めません");
    const mountCountAfterCrash = mountCount;

    // リセット操作: 以後 Thrower は throw しない（原因が解消された想定）
    shouldThrow = false;

    const resetButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("リセットして編集を続ける"),
    );
    expect(resetButton).toBeDefined();

    await act(async () => {
      resetButton?.click();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith(EMPTY_LEXICAL_EDITOR_STATE_JSON);
    expect(el.textContent).not.toContain("本文を読み込めません");
    expect(el.querySelector('[data-testid="recovered"]')).not.toBeNull();
    // key の世代カウンタにより children が完全に再マウントされている
    expect(mountCount).toBeGreaterThan(mountCountAfterCrash);
  });

  test("汎用フォールバックの再試行は onChange を一切呼ばず children を再マウントする（非破壊）", async () => {
    const onChange = mock((_json: string) => undefined);
    const el = renderBoundary(VALID_EMPTY_JSON, onChange);
    await waitForText(el, "エディタの読み込み中にエラーが発生しました");
    const mountCountAfterCrash = mountCount;

    // 再試行操作: 以後 Thrower は throw しない（原因が解消された想定）
    shouldThrow = false;

    const retryButton = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("再試行する"),
    );
    expect(retryButton).toBeDefined();

    act(() => {
      retryButton?.click();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain(
      "エディタの読み込み中にエラーが発生しました",
    );
    expect(el.querySelector('[data-testid="recovered"]')).not.toBeNull();
    // key の世代カウンタにより children が完全に再マウントされている
    expect(mountCount).toBeGreaterThan(mountCountAfterCrash);
  });
});
