/**
 * @description `LazyLexicalEditor` / `LexicalMountErrorBoundary` の
 * dynamic import 再試行に関するテスト（PR#1352 レビュー指摘 P2 対応）。
 *
 * codex レビュー指摘: `LexicalMountErrorBoundary` の汎用フォールバック
 * 「再試行する」は generation key で children を remount するだけで、
 * `next/dynamic`（`LexicalEditorDynamic`）が chunk 読み込み失敗で reject
 * した場合にこれを回復できない。理由は React 19 の `React.lazy()` が
 * loader 呼び出し結果（payload._status/_result）をコンポーネント参照の
 * クロージャに恒久キャッシュするため（`node_modules/react/cjs/react.development.js`
 * の `lazyInitializer` 実装で実測確認済み。バンドラー実装非依存の
 * React コア自体の挙動）。同一コンポーネント参照のまま remount しても
 * payload の rejected 状態は変わらず、loader（＝ dynamic import）は
 * 再実行されない。`next/dynamic` は「`React.lazy()` + `Suspense` の組み合わせ」
 * （Next.js 公式ドキュメント記載）であり、この恒久キャッシュは
 * `next/dynamic` のラッパー自体ではなく React コア（`React.lazy`）に
 * 由来するバンドラー非依存の挙動。
 *
 * Test 1 / Test 2 は、実際にインストールされている React 19 の
 * `React.lazy` + `Suspense` を**モックせず**使い、完全に制御可能な
 * loader（reject/resolve をテストコードから切り替え）でこの挙動を実測する
 * （`next/dynamic` 自体を経由しない理由: このテスト実行環境（bun test +
 * jsdom、ブラウザではない）では `next/dynamic` の legacy react-loadable
 * 互換層が reject 時に Suspense/ErrorBoundary まで伝播せず `loading` 表示に
 * 留まり続ける、この harness 固有の現象を確認した。`next/dynamic` が
 * 内部で使う `React.lazy` 単体では resolve/reject どちらも本テストの
 * bare React.lazy + Suspense + ErrorBoundary で問題なく伝播することを
 * 確認済みのため、この現象は next/dynamic 側の legacy prop 経由の
 * ローディング表示に関する test-harness 固有の癖であり、実ブラウザでの
 * next/dynamic の標準的な chunk-load-error 伝播（本 PR のバグ報告の前提、
 * かつ Next.js 公式ドキュメント記載の標準動作）とは別物と判断した。
 * バグの本体である「React.lazy payload の恒久キャッシュ」はバンドラー非依存の
 * React コア挙動のため、bare React.lazy でのテストは対象の仕組みを
 * 過不足なく検証できる）。
 *
 * Test 3 は `LazyLexicalEditor.tsx` / `LexicalMountErrorBoundary.tsx` の
 * 実配線（`onRetryDynamicImport`）が壊れていないことを確認する統合テスト。
 * こちらは実際に `next/dynamic` 経由（`LazyLexicalEditor` の本番コード）で
 * 「dynamic import 自体は成功するが、解決したコンポーネントの初回 render が
 * 例外を投げる」ケース（既存 `lexical-mount-error-boundary.test.tsx` と
 * 同種の失敗パターン）で配線を検証する。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
// `../../../../setup-dom` は import されるだけで JSDOM の window を
// グローバルに設定する副作用を持つ（モジュール末尾の即時呼び出し）。
// `next/dynamic` はモジュール評価時に `typeof window === 'undefined'` を
// 1 度だけ判定して `isServerSide` に固定するため、`next/dynamic` を
// import するより必ず先にこの import を置くこと（順序を変えると
// `isServerSide: true` に固定され、`ssr: false` の component が常に
// server-only fallback を返し loader が一切呼ばれなくなる）。
import { installJSDOMForTests } from "../../../../setup-dom";
import {
  act,
  lazy,
  Suspense,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

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
  Toaster: () => null,
}));

/**
 * 第 3 describe（実配線テスト）用の fake `LexicalEditor`。
 * 既存 `lexical-mount-error-boundary.test.tsx` の `Thrower` と同じ
 * 「外部から明示的に切り替える shouldThrow フラグ」方式にする
 * （render 回数ベースの自己判定は、React の dev-mode 二重 render に
 * よる自己回復と区別がつかず、意図しない誤判定を招くため使わない）。
 *
 * mock.module は宣言後に対象を動的 import する必要がある（テスト対象の
 * 静的 import は mock 適用前に評価されるため）ため、ここで先に宣言してから
 * ファイル直下で `mock.module` → `await import` する（top-level await、
 * describe コールバック内の await ではない — 既存
 * `lexical-mount-error-boundary.test.tsx` と同じ安全なパターン）。
 */
let fakeEditorShouldThrow = true;
let fakeEditorMountCount = 0;
function FakeLexicalEditor() {
  fakeEditorMountCount += 1;
  if (fakeEditorShouldThrow) {
    throw new Error("boom: simulated LexicalEditor mount failure");
  }
  return <div data-testid="fake-editor-mounted">mounted</div>;
}
mock.module("@/admin/components/editor/lexical/LexicalEditor", () => ({
  LexicalEditor: FakeLexicalEditor,
}));

const { LexicalMountErrorBoundary } =
  await import("@/admin/components/editor/lexical/LexicalMountErrorBoundary");
const { LazyLexicalEditor } =
  await import("@/admin/components/editor/lexical/LazyLexicalEditor");

/** 未登録 type を含まない、完全に有効な EditorState JSON（本文破損ではないことが確定するテスト用 contentJson） */
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

/**
 * `componentDidCatch` がキックする
 * `await import("./config/registered-node-types")` の解決を待つ。
 * 既存の `lexical-mount-error-boundary.test.tsx` と同じポーリング方式。
 */
async function waitForText(
  container: HTMLElement,
  text: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!container.textContent?.includes(text)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForText timed out after ${timeoutMs}ms waiting for: ${text}`,
      );
    }
    // eslint-disable-next-line no-await-in-loop -- ポーリングのため意図的に逐次 await
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function findButtonByText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

/** `next/dynamic({ssr:false})` は `React.lazy` + `Suspense` の組み合わせ（Next.js 公式）。詳細はファイル先頭 doc comment。 */
function createLazyComponent(
  loader: () => Promise<{ default: ComponentType<Record<string, never>> }>,
): ComponentType<Record<string, never>> {
  const Lazy = lazy(loader);
  return function LazyWithSuspense() {
    return (
      <Suspense fallback={null}>
        <Lazy />
      </Suspense>
    );
  };
}

describe("React.lazy の恒久キャッシュ機構（LazyLexicalEditor の dynamic import 再試行の基盤メカニズム）", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  const originalConsoleError = console.error;

  beforeEach(() => {
    installJSDOMForTests();
    confirmMock.mockClear();
    confirmMock.mockImplementation(async () => true);
    // React の開発時デフォルト挙動: Error Boundary が catch した後も
    // 該当エラーを console.error に出力する（正常な仕様、テスト失敗ではない）。
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

  function mountInto(node: ReactNode): HTMLDivElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;
    act(() => {
      localRoot.render(node);
    });
    return el;
  }

  test("バグの実在確認: 同一 lazy component 参照のまま remount しても、rejected React.lazy payload はキャッシュされ loader（import）が再実行されない", async () => {
    let loaderCallCount = 0;
    // next/dynamic はモジュール直下で 1 度だけ dynamic() を呼ぶ想定の API。
    // ここでは PR#1352 の元実装（LazyLexicalEditor.tsx の旧コード）を模して
    // 「同一コンポーネント参照を使い続ける」パターンをそのまま再現する。
    const StableLazyComponent = createLazyComponent(() => {
      loaderCallCount += 1;
      return Promise.reject(new Error("simulated chunk load failure"));
    });

    const onChange = mock((_json: string) => undefined);
    const el = mountInto(
      <LexicalMountErrorBoundary
        contentJson={VALID_EMPTY_JSON}
        onChange={onChange}
      >
        <StableLazyComponent />
      </LexicalMountErrorBoundary>,
    );

    await waitForText(el, "エディタの読み込み中にエラーが発生しました");
    expect(loaderCallCount).toBe(1);

    const retryButton = findButtonByText(el, "再試行する");
    expect(retryButton).toBeDefined();

    act(() => {
      retryButton?.click();
    });

    // remount 後も同一コンポーネント参照（＝同一 payload）のため、
    // rejected 状態がキャッシュされたまま即座に再度 componentDidCatch される。
    await waitForText(el, "エディタの読み込み中にエラーが発生しました");
    expect(loaderCallCount).toBe(1);
  });

  test("修正の実効性確認: onRetryDynamicImport で新しい lazy component に差し替えると、chunk 読み込み失敗から回復できる", async () => {
    let loaderCallCount = 0;
    function createComponent(): ComponentType<Record<string, never>> {
      return createLazyComponent(() => {
        loaderCallCount += 1;
        if (loaderCallCount === 1) {
          return Promise.reject(
            new Error("simulated transient chunk load failure"),
          );
        }
        return Promise.resolve({
          default: () => (
            <div data-testid="recovered-dynamic-chunk">recovered</div>
          ),
        });
      });
    }

    function Harness() {
      // useState に function（component）を保持する際は必ず lazy initializer /
      // updater 関数で包む（React が updater と誤解釈するのを防ぐ）。
      const [Comp, setComp] = useState<ComponentType<Record<string, never>>>(
        () => createComponent(),
      );
      return (
        <LexicalMountErrorBoundary
          contentJson={VALID_EMPTY_JSON}
          onChange={() => undefined}
          onRetryDynamicImport={() => setComp(() => createComponent())}
        >
          <Comp />
        </LexicalMountErrorBoundary>
      );
    }

    const el = mountInto(<Harness />);

    await waitForText(el, "エディタの読み込み中にエラーが発生しました");
    expect(loaderCallCount).toBe(1);

    const retryButton = findButtonByText(el, "再試行する");
    expect(retryButton).toBeDefined();

    act(() => {
      retryButton?.click();
    });

    await waitForText(el, "recovered");
    expect(loaderCallCount).toBe(2);
    expect(
      el.querySelector('[data-testid="recovered-dynamic-chunk"]'),
    ).not.toBeNull();
  });
});

describe("LazyLexicalEditor の実配線（onRetryDynamicImport）", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  const originalConsoleError = console.error;

  beforeEach(() => {
    installJSDOMForTests();
    confirmMock.mockClear();
    confirmMock.mockImplementation(async () => true);
    fakeEditorShouldThrow = true;
    fakeEditorMountCount = 0;
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

  test("boundary が onRetryDynamicImport を受け取り、再試行で新しい component に差し替えて回復する", async () => {
    const onChange = mock((_json: string) => undefined);
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;

    act(() => {
      localRoot.render(
        <LazyLexicalEditor
          contentJson={VALID_EMPTY_JSON}
          onChange={onChange}
        />,
      );
    });

    await waitForText(el, "エディタの読み込み中にエラーが発生しました");
    const mountCountAfterCrash = fakeEditorMountCount;
    expect(mountCountAfterCrash).toBeGreaterThan(0);

    // 再試行操作: 以後 FakeLexicalEditor は throw しない（原因が解消された想定）
    fakeEditorShouldThrow = false;

    const retryButton = findButtonByText(el, "再試行する");
    expect(retryButton).toBeDefined();

    act(() => {
      retryButton?.click();
    });

    await waitForText(el, "mounted");
    expect(
      el.querySelector('[data-testid="fake-editor-mounted"]'),
    ).not.toBeNull();
    expect(fakeEditorMountCount).toBeGreaterThan(mountCountAfterCrash);
  });
});
