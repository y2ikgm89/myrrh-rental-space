/**
 * @description admin スペース編集の「料金プレビュー」が、定額割引を時間単価へ
 * 按分しないことの回帰テスト。
 *
 * 実請求の SSoT は `calculateSpaceDiscount`（定額は予約合計から一律で引く）。
 * 公開予約フローも合計の行項目「スペース割引」で出す。プレビューだけが時間単価
 * から定額を引いて見せると、2 時間予約で見積りと実請求がずれる。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FieldMetadata } from "@conform-to/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

type StubChildren = { children?: ReactNode };

mock.module("@/admin/components/ui", () => ({
  Card: ({ children }: StubChildren) => <div>{children}</div>,
  CardContent: ({ children }: StubChildren) => <div>{children}</div>,
  CardHeader: ({ children }: StubChildren) => <div>{children}</div>,
  CardTitle: ({ children }: StubChildren) => <h2>{children}</h2>,
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
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  ),
  Label: ({ children }: StubChildren) => <label>{children}</label>,
  TabsContent: ({ children }: StubChildren) => <div>{children}</div>,
  Tooltip: ({ children }: StubChildren) => <div>{children}</div>,
  TooltipProvider: ({ children }: StubChildren) => <div>{children}</div>,
  TooltipContent: ({ children }: StubChildren) => <div>{children}</div>,
  TooltipTrigger: ({ children }: StubChildren) => <div>{children}</div>,
  Select: ({ children }: StubChildren) => <div>{children}</div>,
  SelectContent: ({ children }: StubChildren) => <div>{children}</div>,
  SelectItem: ({ children }: StubChildren) => <div>{children}</div>,
  SelectTrigger: ({ children }: StubChildren) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

mock.module(
  "@/app/(admin)/admin/(dashboard)/spaces/_components/SpaceRatePlanList",
  () => ({ SpaceRatePlanList: () => null }),
);

const { SpaceEditPricingTab } =
  await import("@/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/SpaceEditPricingTab");
const { DEFAULT_TAX_SETTINGS } = await import("@/shared/lib/pricing/tax");
const { DiscountType, DurationDiscountOverride, TaxRateType } =
  await import("@/shared/lib/validations/enums/prisma-types");

type PricingTabProps = Parameters<typeof SpaceEditPricingTab>[0];

function stubField(
  name: "hourlyPrice" | "discountValue",
): FieldMetadata<unknown> {
  return {
    key: undefined,
    id: `space-${name}`,
    errorId: `space-${name}-error`,
    descriptionId: `space-${name}-description`,
    name,
    defaultValue: undefined,
    defaultOptions: undefined,
    defaultChecked: undefined,
    initialValue: undefined,
    value: undefined,
    errors: undefined,
    allErrors: {},
    valid: true,
    dirty: false,
    formId: "space-edit-form",
  };
}

const stubFields: PricingTabProps["fields"] = {
  hourlyPrice: stubField("hourlyPrice"),
  discountValue: stubField("discountValue"),
};

describe("SpaceEditPricingTab の料金プレビュー", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
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

  function renderPreview(options: {
    discountType: PricingTabProps["discountType"];
    discountValue: string;
  }): HTMLDivElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;
    act(() => {
      localRoot.render(
        <SpaceEditPricingTab
          isEdit={false}
          space={undefined}
          isPending={false}
          hourlyPrice="5000"
          discountType={options.discountType}
          onDiscountTypeChange={() => {}}
          discountValue={options.discountValue}
          onDiscountValueChange={() => {}}
          durationDiscountOverride={DurationDiscountOverride.INHERIT}
          onDurationDiscountOverrideChange={() => {}}
          taxRateType={TaxRateType.STANDARD}
          onTaxRateTypeChange={() => {}}
          taxSettings={DEFAULT_TAX_SETTINGS}
          ratePlans={[]}
          onHourlyPriceChange={() => {}}
          fields={stubFields}
        />,
      );
    });
    return el;
  }

  test("定額割引は時間単価に按分せず、予約合計への注記を出す", () => {
    const el = renderPreview({
      discountType: DiscountType.FIXED,
      discountValue: "500",
    });

    expect(el.textContent).toContain("5,000");
    expect(el.textContent).not.toContain("4,500");
    expect(el.textContent).toContain("予約合計");
  });

  test("パーセント割引は時間単価に反映する", () => {
    const el = renderPreview({
      discountType: DiscountType.PERCENTAGE,
      discountValue: "10",
    });

    expect(el.textContent).toContain("4,500");
  });
});
