import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

/**
 * Round-5 audit Finding #20/#21 の回帰防止テスト + ポリシー推奨額ヒント
 * (Phase 3 reservation-operations-uplift Task 9) のテスト。
 *
 * - remaining (残額) = refundableTotal - cumulativeRefunded の計算そのものを
 *   固定する（プロパティ名を `totalPriceWithTax` → `refundableTotal` に
 *   変えたのは、呼出元 (ReservationDetail.tsx) が税込合計ではなく
 *   Stripe への実 charge 額 = 税抜 totalPrice を渡すよう修正したのが本体で、
 *   コンポーネント自体の計算ロジックは元々正しかった。ここでは
 *   「渡された2値から残額と超過 validation を正しく導出する」契約を守る）。
 * - cumulativeRefunded 省略時のデフォルト 0 も明示的に検証する。
 * - suggestedAmount (返金ポリシーに基づく推奨額) のヒント表示・
 *   「推奨額を使用」ボタンの挙動も検証する。
 */

mock.module("@/admin/components/ui", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Input: ({
    value,
    onChange,
    disabled,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    disabled?: boolean;
  }) => (
    <input
      data-testid="refund-amount-input"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  ),
  Label: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => <span />,
  Textarea: () => <textarea />,
}));

// React 制御下 input の programmatic 変更: native setter で value を書換えてから
// input event を dispatch する (React は元 setter を差替えて change 検知するため、
// 素の `input.value = ...` 代入だけでは state が更新されない)。
// RecurrenceFields.test.tsx と同型のパターン。
function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const { RefundDialog } =
  await import("@/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog");

describe("RefundDialog", () => {
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

  test("cumulativeRefunded 省略時は 0 として扱い、残額 = refundableTotal になる", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          onConfirm={mock()}
          isPending={false}
        />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).toContain("残額 ¥10,000");
  });

  test("残額 = refundableTotal - cumulativeRefunded (部分返金済みを反映する)", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          cumulativeRefunded={3000}
          onConfirm={mock()}
          isPending={false}
        />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).toContain("合計 ¥10,000");
    expect(text).toContain("累積返金額 ¥3,000");
    expect(text).toContain("残額 ¥7,000");
  });

  test("残額を超える金額は onConfirm を呼ばずエラーを表示する", async () => {
    const onConfirm = mock();
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          cumulativeRefunded={3000}
          onConfirm={onConfirm}
          isPending={false}
        />,
      );
    });

    const input = container?.querySelector(
      '[data-testid="refund-amount-input"]',
    ) as HTMLInputElement;
    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "返金する");

    await act(async () => {
      setInputValue(input, "8000"); // remaining (7000) を超える
    });
    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(container?.textContent ?? "").toContain(
      "金額が残額 (¥7,000) を超えています。",
    );
  });

  test("残額以内の金額は onConfirm に amount として渡る", async () => {
    const onConfirm = mock();
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          cumulativeRefunded={3000}
          onConfirm={onConfirm}
          isPending={false}
        />,
      );
    });

    const input = container?.querySelector(
      '[data-testid="refund-amount-input"]',
    ) as HTMLInputElement;
    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "返金する");

    await act(async () => {
      setInputValue(input, "5000"); // remaining (7000) 以内
    });
    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith({ amount: 5000 });
  });

  test("suggestedAmount が指定された場合、ポリシー推奨額のヒントが表示される", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          cumulativeRefunded={0}
          suggestedAmount={5000}
          onConfirm={() => {}}
          isPending={false}
        />,
      );
    });

    const hintText = container?.textContent;
    expect(hintText).toContain("ポリシー推奨額");
    expect(hintText).toContain("5,000");
  });

  test("suggestedAmount が指定されていない場合、ヒントは表示されない", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          cumulativeRefunded={0}
          onConfirm={() => {}}
          isPending={false}
        />,
      );
    });

    const hintText = container?.textContent;
    expect(hintText).not.toContain("ポリシー推奨額");
  });

  test("「推奨額を使用」ボタン押下で、amount input に推奨額が入力される", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          cumulativeRefunded={0}
          suggestedAmount={5000}
          onConfirm={() => {}}
          isPending={false}
        />,
      );
    });

    const suggestedButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "推奨額を使用");
    const input = container?.querySelector(
      '[data-testid="refund-amount-input"]',
    ) as HTMLInputElement;

    expect(input.value).toBe("");

    await act(async () => {
      suggestedButton?.click();
    });

    expect(input.value).toBe("5000");
  });

  test("推奨額を入力した後、返金確定で amount を含めて onConfirm する", async () => {
    const onConfirm = mock();
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(
        <RefundDialog
          open={true}
          onOpenChange={() => {}}
          refundableTotal={10000}
          cumulativeRefunded={0}
          suggestedAmount={5000}
          onConfirm={onConfirm}
          isPending={false}
        />,
      );
    });

    const suggestedButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "推奨額を使用");

    await act(async () => {
      suggestedButton?.click();
    });

    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "返金する");

    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith({ amount: 5000 });
  });
});
