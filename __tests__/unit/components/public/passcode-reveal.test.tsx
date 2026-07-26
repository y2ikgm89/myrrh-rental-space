/**
 * PasscodeReveal — guest / member 予約詳細ハブ共通の解錠番号 UI。
 * SwitchBot ハードウェアは mock せず、props と server action の戻り値のみ検証する。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installJSDOMForTests } from "../../../setup-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const revealReservationPasscodesActionMock = mock<
  (reservationId: string) => Promise<
    | {
        readonly status: "visible";
        readonly passcodes: readonly {
          readonly deviceName: string;
          readonly passcode: string;
        }[];
      }
    | {
        readonly status: "pending" | "outside_window" | "unavailable";
        readonly passcodes: readonly [];
      }
    | { readonly error: string }
  >
>(async () => ({
  status: "visible",
  passcodes: [{ deviceName: "入口", passcode: "1234" }],
}));

mock.module(
  "@/app/(public)/_shared/actions/reveal-reservation-passcodes",
  () => ({
    revealReservationPasscodesAction: revealReservationPasscodesActionMock,
  }),
);

mock.module("@/public/components/design-system/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
}));

installJSDOMForTests();

const { PasscodeReveal } =
  await import("@/app/(public)/_shared/components/passcode-reveal");

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  revealReservationPasscodesActionMock.mockReset();
  revealReservationPasscodesActionMock.mockImplementation(async () => ({
    status: "visible",
    passcodes: [{ deviceName: "入口", passcode: "1234" }],
  }));
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

async function renderPasscodeReveal(
  initialState:
    | { readonly status: "unavailable" }
    | { readonly status: "pending" }
    | { readonly status: "outside_window" }
    | { readonly status: "visible" },
): Promise<void> {
  await act(async () => {
    root?.render(
      <PasscodeReveal
        reservationId="00000000-0000-4000-8000-000000000001"
        initialState={initialState}
      />,
    );
  });
}

function textContent(): string {
  return container?.textContent ?? "";
}

describe("PasscodeReveal", () => {
  test("unavailable は何も描画しない", async () => {
    await renderPasscodeReveal({ status: "unavailable" });
    expect(container?.innerHTML).toBe("");
  });

  test("pending は発行待ちメッセージを表示する", async () => {
    await renderPasscodeReveal({ status: "pending" });
    expect(textContent()).toContain("解錠番号を発行しています");
    expect(textContent()).toContain("スマートロック");
  });

  test("outside_window は表示期間外メッセージを表示する", async () => {
    await renderPasscodeReveal({ status: "outside_window" });
    expect(textContent()).toContain("表示期間外");
  });

  test("visible は表示ボタンを出し、成功時に平文を描画する", async () => {
    revealReservationPasscodesActionMock.mockImplementation(async () => ({
      status: "visible",
      passcodes: [{ deviceName: "入口キーパッド", passcode: "567890" }],
    }));

    await renderPasscodeReveal({ status: "visible" });
    expect(textContent()).toContain("解錠番号を表示");

    const button = container?.querySelector("button");
    expect(button).not.toBeNull();

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(revealReservationPasscodesActionMock).toHaveBeenCalledTimes(1);
    expect(textContent()).toContain("入口キーパッド");
    expect(textContent()).toContain("567890");
  });

  test("action が pending を返したら発行待ちメッセージに切り替わる", async () => {
    revealReservationPasscodesActionMock.mockImplementation(async () => ({
      status: "pending",
      passcodes: [],
    }));

    await renderPasscodeReveal({ status: "visible" });
    const button = container?.querySelector("button");

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(textContent()).toContain("解錠番号を発行しています");
    expect(textContent()).toContain("再表示");
    const retryButton = container?.querySelector("button");
    expect(retryButton).not.toBeNull();
    expect(retryButton?.textContent).toContain("再表示");
  });

  test("action が outside_window を返したら期間外メッセージに切り替わる", async () => {
    revealReservationPasscodesActionMock.mockImplementation(async () => ({
      status: "outside_window",
      passcodes: [],
    }));

    await renderPasscodeReveal({ status: "visible" });
    const button = container?.querySelector("button");

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(textContent()).toContain("表示期間外");
  });

  test("action エラー時は role=alert でメッセージを表示する", async () => {
    revealReservationPasscodesActionMock.mockImplementation(async () => ({
      error: "権限がありません",
    }));

    await renderPasscodeReveal({ status: "visible" });
    const button = container?.querySelector("button");

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    const alert = container?.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("権限がありません");
  });
});
