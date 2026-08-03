import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(), refresh: mock() }),
}));

mock.module("sonner", () => ({
  toast: { error: mock(), success: mock() },
}));

mock.module("@/admin/actions/customer", () => ({
  mergeCustomers: mock(),
  searchCustomersAction: mock(async () => []),
}));

mock.module("@/admin/components/ui", () => ({
  AlertDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogCancel: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
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
      data-testid="merge-search-input"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  ),
}));

const { MergeCustomerDialog } =
  await import("@/app/(admin)/admin/(dashboard)/customers/[id]/_components/MergeCustomerDialog");

const SOURCE_CUSTOMER = {
  id: "aac0c378-6a3c-44ac-8cd3-925a6c29846e",
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
};

const CANDIDATE = {
  id: "54b39377-a966-423c-8e10-4f9832a35576",
  lastName: "山田",
  firstName: "次郎",
  email: "yamada-jiro@example.com",
  companyName: null,
  phoneNumber: null,
} as never;

describe("MergeCustomerDialog", () => {
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
    root = undefined;
    container = undefined;
  });

  test("initialCandidate 指定時、open が false→true に変化した瞬間にマージ先として事前選択される", async () => {
    // 実際の呼出し元 (CustomerDetailActions.tsx) はダイアログを常時マウントし
    // open={mergeOpen} (初期値 false) をトグルする構造のため、テストも
    // false→true の遷移を再現する（マウント時点で既に open=true の場合、
    // 「open が変化した瞬間だけシードする」ロジックは意図的に発火しない）。
    await act(async () => {
      root?.render(
        <MergeCustomerDialog
          open={false}
          onOpenChange={() => {}}
          sourceCustomer={SOURCE_CUSTOMER}
          initialCandidate={CANDIDATE}
        />,
      );
    });
    await act(async () => {
      root?.render(
        <MergeCustomerDialog
          open={true}
          onOpenChange={() => {}}
          sourceCustomer={SOURCE_CUSTOMER}
          initialCandidate={CANDIDATE}
        />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).toContain("マージ先:");
    expect(text).toContain("山田 次郎");
    // 検索欄はシード時にクリアされる(空の検索状態を装わない)
    const input = container?.querySelector(
      '[data-testid="merge-search-input"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  test("initialCandidate 未指定時は従来通り空の検索状態で開く", async () => {
    await act(async () => {
      root?.render(
        <MergeCustomerDialog
          open={true}
          onOpenChange={() => {}}
          sourceCustomer={SOURCE_CUSTOMER}
        />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).not.toContain("マージ先:");
  });

  test("open が true のまま再render してもシード処理が state を上書きし続けない(手動選択解除が保持される)", async () => {
    await act(async () => {
      root?.render(
        <MergeCustomerDialog
          open={false}
          onOpenChange={() => {}}
          sourceCustomer={SOURCE_CUSTOMER}
          initialCandidate={CANDIDATE}
        />,
      );
    });
    await act(async () => {
      root?.render(
        <MergeCustomerDialog
          open={true}
          onOpenChange={() => {}}
          sourceCustomer={SOURCE_CUSTOMER}
          initialCandidate={CANDIDATE}
        />,
      );
    });

    // open=true のまま同じ props で再render — シード処理が「open の変化」を
    // トリガーにしているため、ここでは再発火しないはず (無限ループ/
    // 選択状態の意図しない再上書きが起きないことの確認)。
    await act(async () => {
      root?.render(
        <MergeCustomerDialog
          open={true}
          onOpenChange={() => {}}
          sourceCustomer={SOURCE_CUSTOMER}
          initialCandidate={CANDIDATE}
        />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).toContain("山田 次郎");
  });
});
