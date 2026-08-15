import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("next/navigation", () => ({
  // module graph 上の admin セッション検証が notFound を named import する。
  // mock に無いと `Export named 'notFound' not found` で module load ごと落ちる。
  notFound: mock(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: mock(),
  useRouter: () => ({ push: mock(), refresh: mock() }),
}));

mock.module("sonner", () => ({
  toast: { error: mock(), success: mock() },
}));

mock.module("@/admin/actions/customer", () => ({
  updateCustomer: mock(() => Promise.resolve({})),
}));

type UiProps = { children?: ReactNode; [key: string]: unknown };

mock.module("@/admin/components/ui", () => ({
  Button: ({ children, ...props }: UiProps) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Card: ({ children }: UiProps) => <div>{children}</div>,
  Input: (props: UiProps) => <input {...props} />,
  Label: ({ children, ...props }: UiProps) => (
    <label {...props}>{children}</label>
  ),
  Select: ({ children }: UiProps) => <div>{children}</div>,
  SelectContent: ({ children }: UiProps) => <div>{children}</div>,
  SelectItem: ({ children }: UiProps) => <div>{children}</div>,
  SelectTrigger: ({ children }: UiProps) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SubmitButton: ({ label }: { label?: string }) => (
    <button type="submit">{label}</button>
  ),
  Switch: ({ checked, id }: { checked?: boolean; id?: string }) => (
    <button type="button" id={id} data-checked={String(checked)} />
  ),
  Textarea: (props: UiProps) => <textarea {...props} />,
}));

const { CustomerEditForm } =
  await import("@/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm");

/**
 * 管理画面の予約作成で新規顧客を作ると customerType は PERSONAL 既定のまま
 * companyName だけが埋まる（resolve-customer.ts:87-88）。この形の行が編集画面を
 * 素通りしても会社名を失わないことを固定する。
 */
const PERSONAL_CUSTOMER_WITH_COMPANY = {
  id: "3f0b6c3e-6d4f-4a9d-8c0a-91d2f6f0a111",
  lastName: "山田",
  firstName: "太郎",
  lastNameKana: "ヤマダ",
  firstNameKana: "タロウ",
  companyName: "株式会社ミルラ",
  customerType: "PERSONAL",
  email: "yamada@example.com",
  phoneNumber: "090-1234-5678",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "神宮前1-1-1",
  building: null,
  status: "NEW",
  notes: null,
  totalReservations: 0,
  totalSpent: null,
  lastReservationAt: null,
  firstReservationAt: null,
  isActive: true,
  marketingOptIn: false,
  phoneContactOptIn: true,
  userId: null,
  flaggedForReviewAt: null,
  flagReasons: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  reservations: [],
};

describe("CustomerEditForm", () => {
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

  test("PERSONAL の顧客を編集しても companyName が FormData に 1 件だけ載る", async () => {
    await act(async () => {
      root?.render(
        <CustomerEditForm customer={PERSONAL_CUSTOMER_WITH_COMPANY as never} />,
      );
    });

    const formElement = container?.querySelector("form");
    // Bun の global FormData は JSDOM の form 要素を読めず常に空になる。
    // JSDOM 側の FormData を使うこと（setup-dom.ts は window を globalThis に載せる）。
    const formData = new window.FormData(formElement as HTMLFormElement);

    expect(formData.getAll("companyName")).toEqual(["株式会社ミルラ"]);
  });

  test("CORPORATE の顧客を編集しても companyName が FormData に 1 件だけ載る", async () => {
    await act(async () => {
      root?.render(
        <CustomerEditForm
          customer={
            {
              ...PERSONAL_CUSTOMER_WITH_COMPANY,
              customerType: "CORPORATE",
            } as never
          }
        />,
      );
    });

    const formElement = container?.querySelector("form");
    const formData = new window.FormData(formElement as HTMLFormElement);

    expect(formData.getAll("companyName")).toHaveLength(1);
  });
});
