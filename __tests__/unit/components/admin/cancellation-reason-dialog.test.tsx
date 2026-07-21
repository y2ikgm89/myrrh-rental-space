import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("@/admin/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  Label: ({
    children,
    htmlFor,
  }: {
    children?: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
  Select: ({
    children,
    onValueChange,
    value,
    disabled,
  }: {
    children?: React.ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
    disabled?: boolean;
  }) => (
    <select
      aria-label="キャンセル理由 (任意)"
      onChange={(e) => onValueChange?.(e.target.value)}
      value={value}
      disabled={disabled}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  Textarea: ({
    value,
    onChange,
    maxLength,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    maxLength?: number;
  }) => (
    <textarea
      value={value}
      onChange={onChange as never}
      maxLength={maxLength}
    />
  ),
}));

const { CancellationReasonDialog } =
  await import("@/app/(admin)/admin/(dashboard)/reservations/_components/CancellationReasonDialog");

describe("CancellationReasonDialog", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

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
  });

  test("プリセット選択時、選択値を reason として onConfirm する", async () => {
    const onConfirm = mock();
    await act(async () => {
      root?.render(
        <CancellationReasonDialog
          open={true}
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          isPending={false}
        />,
      );
    });

    const select = container?.querySelector("select") as HTMLSelectElement;
    // Set the select value to a preset reason
    await act(async () => {
      select.value = "顧客都合キャンセル";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Find and click the confirm button
    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "キャンセルする");
    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith("顧客都合キャンセル");
  });

  test("理由なしで確定すると reason=undefined で onConfirm する", async () => {
    const onConfirm = mock();
    await act(async () => {
      root?.render(
        <CancellationReasonDialog
          open={true}
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          isPending={false}
        />,
      );
    });

    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "キャンセルする");
    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
