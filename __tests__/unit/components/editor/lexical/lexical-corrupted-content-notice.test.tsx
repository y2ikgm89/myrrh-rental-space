/**
 * @description `LexicalCorruptedContentNotice` のコンポーネントテスト。
 * `useConfirm` / `sonner` は Radix AlertDialog のポータル・フォーカストラップ実装に
 * 依存しないよう mock し、このコンポーネント自身の分岐ロジック
 * （文言組み立て・onChange の有無によるボタン表示・confirm ゲート・コピー）を検証する。
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

const toastSuccessMock = mock(() => undefined);
mock.module("sonner", () => ({
  toast: { success: toastSuccessMock, error: mock(() => undefined) },
  // @/admin/components/ui バレル経由で toaster.tsx が named import する。
  // このテストでは Toaster 自体はマウントしないためダミーで足りる。
  Toaster: () => null,
}));

const { LexicalCorruptedContentNotice } =
  await import("@/admin/components/editor/lexical/parts/LexicalCorruptedContentNotice");
const { EMPTY_LEXICAL_EDITOR_STATE_JSON } =
  await import("@/shared/lib/validations/lexical");

type NoticeProps = Parameters<typeof LexicalCorruptedContentNotice>[0];

describe("LexicalCorruptedContentNotice", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
    confirmMock.mockClear();
    confirmMock.mockImplementation(async () => true);
    toastSuccessMock.mockClear();
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

  function renderNotice(props: NoticeProps): HTMLDivElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;
    act(() => {
      localRoot.render(<LexicalCorruptedContentNotice {...props} />);
    });
    return el;
  }

  function findButtonByText(
    el: HTMLElement,
    text: string,
  ): HTMLButtonElement | undefined {
    return Array.from(el.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text),
    );
  }

  test("見出しと未登録 type 一覧を表示する", () => {
    const el = renderNotice({
      unregisteredTypes: ["foo-widget", "bar-widget"],
      contentJson: "{}",
    });

    expect(el.textContent).toContain("本文を読み込めません");
    expect(el.textContent).toContain("foo-widget、bar-widget");
  });

  test("unregisteredTypes が空なら汎用文言にフォールバックする", () => {
    const el = renderNotice({ unregisteredTypes: [], contentJson: "{}" });

    expect(el.textContent).toContain(
      "本文に未対応の要素が含まれているため、エディタで開けません。",
    );
  });

  test("onChange 未指定ならリセットボタンを表示しない", () => {
    const el = renderNotice({ unregisteredTypes: ["foo"], contentJson: "{}" });

    expect(findButtonByText(el, "リセットして編集を続ける")).toBeUndefined();
  });

  test("onChange 指定時はリセットボタンを表示し、確認後に EMPTY JSON で呼ばれる", async () => {
    const onChange = mock((_json: string) => undefined);
    const el = renderNotice({
      unregisteredTypes: ["foo"],
      contentJson: '{"broken":true}',
      onChange,
    });

    const resetButton = findButtonByText(el, "リセットして編集を続ける");
    expect(resetButton).toBeDefined();

    await act(async () => {
      resetButton?.click();
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(EMPTY_LEXICAL_EDITOR_STATE_JSON);
  });

  test("確認をキャンセルすると onChange は呼ばれない", async () => {
    confirmMock.mockImplementationOnce(async () => false);
    const onChange = mock((_json: string) => undefined);
    const el = renderNotice({
      unregisteredTypes: ["foo"],
      contentJson: "{}",
      onChange,
    });

    const resetButton = findButtonByText(el, "リセットして編集を続ける");

    await act(async () => {
      resetButton?.click();
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("「JSONをコピー」ボタンで navigator.clipboard.writeText が生 JSON で呼ばれる", async () => {
    const writeText = mock((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const el = renderNotice({
      unregisteredTypes: ["foo"],
      contentJson: "raw-json-content",
    });

    const copyButton = findButtonByText(el, "JSONをコピー");
    expect(copyButton).toBeDefined();

    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("raw-json-content");
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });
});
