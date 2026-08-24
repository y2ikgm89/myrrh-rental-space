/**
 * @description admin スペース編集の「料金プレビュー」が、定額割引を時間単価へ
 * 按分しないことの回帰テスト。
 *
 * 実請求の SSoT は `calculateSpaceDiscount`（定額は予約合計から一律で引く）。
 * 公開予約フローも合計の行項目「スペース割引」で出す。プレビューだけが時間単価
 * から定額を引いて見せると、2 時間予約で見積りと実請求がずれる。
 *
 * 監査 A-69: パーセント側も同じ SSoT を名指していながら別式だった。
 * プレビュー `round(base * (1 - r/100))` 対 請求 `base - floor(base * r/100)`。
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
const { calculateSpaceDiscount } =
  await import("@/shared/lib/pricing/discount");
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
    hourlyPrice?: string;
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
          hourlyPrice={options.hourlyPrice ?? "5000"}
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

  test("丸めが割れる値でも請求側の SSoT と一致する（A-69）", () => {
    // 3,333 円 / 15%: floor(3333 * 0.15) = 499 なので請求は 2,834。
    // 旧プレビューは round(3333 * 0.85) = 2,833 を出していた。
    const billed =
      3333 -
      calculateSpaceDiscount(3333, {
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
        durationDiscountOverride: DurationDiscountOverride.INHERIT,
      }).discount;
    // 値の選び方自体が新旧を区別できることを固定する。
    expect(billed).toBe(2834);
    expect(Math.round(3333 * 0.85)).toBe(2833);

    const el = renderPreview({
      discountType: DiscountType.PERCENTAGE,
      discountValue: "15",
      hourlyPrice: "3333",
    });

    expect(el.textContent).toContain("2,834");
    expect(el.textContent).not.toContain("2,833");
  });
});
