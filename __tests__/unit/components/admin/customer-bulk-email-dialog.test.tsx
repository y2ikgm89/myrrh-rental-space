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
  Input: ({
    value,
    onChange,
    disabled,
    maxLength,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    disabled?: boolean;
    maxLength?: number;
  }) => (
    <input
      aria-label="件名"
      value={value}
      onChange={onChange as never}
      disabled={disabled}
      maxLength={maxLength}
    />
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
      aria-label="テンプレート"
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
      aria-label="本文"
      value={value}
      onChange={onChange as never}
      maxLength={maxLength}
    />
  ),
}));

const { CustomerBulkEmailDialog } =
  await import("@/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkEmailDialog");

describe("CustomerBulkEmailDialog", () => {
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

  test("プリセット選択時、件名・本文が自動入力される", async () => {
    const onConfirm = mock();
    await act(async () => {
      root?.render(
        <CustomerBulkEmailDialog
          open={true}
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          isPending={false}
          targetCount={3}
        />,
      );
    });

    const select = container?.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "campaign";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const subjectInput = container?.querySelector("input") as HTMLInputElement;
    const bodyTextarea = container?.querySelector(
      "textarea",
    ) as HTMLTextAreaElement;

    expect(subjectInput.value).toBe("【お得なお知らせ】キャンペーンのご案内");
    expect(bodyTextarea.value.length).toBeGreaterThan(0);
  });

  test("「送信する」押下で onConfirm({subject, body}) が呼ばれる", async () => {
    const onConfirm = mock();
    await act(async () => {
      root?.render(
        <CustomerBulkEmailDialog
          open={true}
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          isPending={false}
          targetCount={2}
        />,
      );
    });

    const select = container?.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "campaign";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "送信する");
    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [args] = onConfirm.mock.calls;
    expect(args?.[0]).toMatchObject({
      subject: "【お得なお知らせ】キャンペーンのご案内",
    });
    expect(typeof args?.[0]?.body).toBe("string");
    expect((args?.[0]?.body as string).length).toBeGreaterThan(0);
  });

  test("件名・本文が未入力のまま確定するとエラーを表示し onConfirm は呼ばれない", async () => {
    const onConfirm = mock();
    await act(async () => {
      root?.render(
        <CustomerBulkEmailDialog
          open={true}
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          isPending={false}
          targetCount={1}
        />,
      );
    });

    const confirmButton = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent === "送信する");
    await act(async () => {
      confirmButton?.click();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(container?.querySelector('[role="alert"]')).not.toBeNull();
  });
});
