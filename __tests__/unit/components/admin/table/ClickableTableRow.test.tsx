import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const pushMock = mock(() => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: mock(() => {}) }),
  usePathname: mock(() => "/"),
  useSearchParams: mock(() => new URLSearchParams()),
  redirect: mock((_url: string): never => {
    throw new Error("redirect");
  }),
  notFound: mock((): never => {
    throw new Error("not_found");
  }),
  useParams: mock(() => ({})),
}));

mock.module("@/admin/components/ui", () => ({
  TableRow: ({
    children,
    tabIndex,
    "aria-label": ariaLabel,
    onClick,
    onKeyDown,
    className,
  }: {
    children?: ReactNode;
    tabIndex?: number;
    "aria-label"?: string;
    onClick?: () => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTableRowElement>) => void;
    className?: string;
  }) => (
    <tr
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={className}
    >
      {children}
    </tr>
  ),
}));

mock.module("@/shared/lib/cn", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const { ClickableTableRow } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/components/table/ClickableTableRow");
const { stopRowClick } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/components/table/click-utils");

describe("ClickableTableRow", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    pushMock.mockClear();
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

  test("行クリックで router.push が href で呼ばれる", async () => {
    await act(async () => {
      root?.render(
        <table>
          <tbody>
            <ClickableTableRow href="/admin/items/abc" aria-label="行ラベル">
              <td>セル1</td>
            </ClickableTableRow>
          </tbody>
        </table>,
      );
    });

    const row = container?.querySelector("tr[aria-label='行ラベル']");
    expect(row).not.toBeNull();

    await act(async () => {
      row?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/admin/items/abc");
  });

  test("Enter キーで router.push が呼ばれる", async () => {
    await act(async () => {
      root?.render(
        <table>
          <tbody>
            <ClickableTableRow href="/admin/items/abc" aria-label="行ラベル">
              <td>セル1</td>
            </ClickableTableRow>
          </tbody>
        </table>,
      );
    });

    const row = container?.querySelector("tr[aria-label='行ラベル']");
    expect(row).not.toBeNull();

    await act(async () => {
      row?.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  test("Space キーでは router.push が呼ばれない（link 慣習）", async () => {
    await act(async () => {
      root?.render(
        <table>
          <tbody>
            <ClickableTableRow href="/admin/items/abc" aria-label="行ラベル">
              <td>セル1</td>
            </ClickableTableRow>
          </tbody>
        </table>,
      );
    });

    const row = container?.querySelector("tr[aria-label='行ラベル']");
    expect(row).not.toBeNull();

    await act(async () => {
      row?.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  test("内部 interactive cell（stopRowClick）は行クリックを遮断する", async () => {
    await act(async () => {
      root?.render(
        <table>
          <tbody>
            <ClickableTableRow href="/admin/items/abc" aria-label="行ラベル">
              <td onClick={stopRowClick}>
                <button type="button" data-testid="inner-button">
                  内部ボタン
                </button>
              </td>
            </ClickableTableRow>
          </tbody>
        </table>,
      );
    });

    const innerButton = container?.querySelector(
      "[data-testid='inner-button']",
    );
    expect(innerButton).not.toBeNull();

    await act(async () => {
      innerButton?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  test("tabIndex={0} と aria-label が付与される", async () => {
    await act(async () => {
      root?.render(
        <table>
          <tbody>
            <ClickableTableRow href="/admin/items/abc" aria-label="行ラベル">
              <td>セル1</td>
            </ClickableTableRow>
          </tbody>
        </table>,
      );
    });

    const row = container?.querySelector("tr[aria-label='行ラベル']");
    expect(row?.getAttribute("tabIndex")).toBe("0");
    expect(row?.getAttribute("aria-label")).toBe("行ラベル");
  });
});
