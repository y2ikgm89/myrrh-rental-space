"use client";

import type { FieldMetadata } from "@conform-to/react";
import { IconHelpCircle } from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsContent,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/admin/components/ui";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { SpaceRatePlanList } from "../SpaceRatePlanList";
import type { SpaceRatePlanForResolver } from "@/shared/lib/pricing/rate-plan-resolver";
import { calculateSpaceDiscount } from "@/shared/lib/pricing/discount";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  getValidDiscountType,
  getValidDurationDiscountOverride,
  getValidTaxRateType,
} from "@/shared/lib/validations/enums/helpers";
import {
  calculateTaxIncludedPrice,
  getTaxRate,
} from "@/shared/lib/pricing/tax";
import { formatCurrency, getTaxRateLabel } from "@/shared/lib/pricing/format";
import type { TaxSettings } from "@/shared/lib/pricing/types";

type SpaceEditPricingTabProps = {
  isEdit: boolean;
  space: SpaceWithStats | undefined;
  isPending: boolean;
  hourlyPrice: string;
  onHourlyPriceChange: (value: string) => void;
  discountType: DiscountType;
  onDiscountTypeChange: (value: DiscountType) => void;
  discountValue: string;
  onDiscountValueChange: (value: string) => void;
  durationDiscountOverride: DurationDiscountOverride;
  onDurationDiscountOverrideChange: (value: DurationDiscountOverride) => void;
  taxRateType: TaxRateType;
  onTaxRateTypeChange: (value: TaxRateType) => void;
  taxSettings: TaxSettings;
  ratePlans: SpaceRatePlanForResolver[];
  fields: {
    hourlyPrice: FieldMetadata;
    discountValue: FieldMetadata;
  };
};

export function SpaceEditPricingTab({
  isEdit,
  space,
  isPending,
  hourlyPrice,
  onHourlyPriceChange,
  discountType,
  onDiscountTypeChange,
  discountValue,
  onDiscountValueChange,
  durationDiscountOverride,
  onDurationDiscountOverrideChange,
  taxRateType,
  onTaxRateTypeChange,
  taxSettings,
  ratePlans,
  fields,
}: SpaceEditPricingTabProps) {
  const hourlyPriceNum = Number(hourlyPrice) || 0;
  const discountValueNum = discountValue === "" ? null : Number(discountValue);
  const hasDiscount =
    discountType !== DiscountType.NONE &&
    discountValueNum !== null &&
    discountValueNum > 0;
  // 定額割引（FIXED）は予約合計から一律で引かれるため時間単価には按分しない
  // （公開予約フローは合計の行項目「スペース割引」で表示する）。
  // パーセント割引は時間に線形スケールするため単価への反映は正確。
  //
  // 丸め方を自分で書かず `calculateSpaceDiscount` に委ねる（監査 A-69）。
  // 旧実装は `round(base * (1 - r/100))` で、請求側の
  // `base - floor(base * r/100)` と別式だった。`base * r / 100` の小数部が
  // 0.5 以上になる組み合わせ（3,333 円 / 15% など）で常に 1 円ずれ、
  // 税込表示にはその差に税率が乗る。
  //
  // `Math.max(0, ...)` は残してある — スペースの PERCENTAGE 値に
  // 100 上限の validation が無いため（coupon 側にしか無い）。
  const isPercentageDiscount =
    hasDiscount && discountType === DiscountType.PERCENTAGE;
  const discountedHourlyPrice = isPercentageDiscount
    ? Math.max(
        0,
        hourlyPriceNum -
          calculateSpaceDiscount(hourlyPriceNum, {
            discountType,
            discountValue: discountValueNum,
            durationDiscountOverride,
          }).discount,
      )
    : hourlyPriceNum;
  const currentTaxRate = getTaxRate(taxRateType, taxSettings);
  const taxIncludedHourlyPrice = calculateTaxIncludedPrice(
    hourlyPriceNum,
    currentTaxRate,
  );
  const discountedTaxIncludedHourlyPrice = calculateTaxIncludedPrice(
    discountedHourlyPrice,
    currentTaxRate,
  );

  return (
    <TabsContent
      value="pricing"
      forceMount
      className="data-[state=inactive]:hidden"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>料金設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="space-hourlyPrice">時間料金（円/時間）*</Label>
              <Input
                id="space-hourlyPrice"
                type="number"
                value={hourlyPrice}
                onChange={(e) => onHourlyPriceChange(e.target.value)}
                placeholder="5000"
                disabled={isPending}
                aria-invalid={fields.hourlyPrice.errors ? true : undefined}
                aria-describedby={
                  fields.hourlyPrice.errors
                    ? fields.hourlyPrice.errorId
                    : undefined
                }
              />
              {fields.hourlyPrice.errors && (
                <p
                  id={fields.hourlyPrice.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.hourlyPrice.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium text-muted-foreground">
                割引設定
              </h4>

              <div className="space-y-2">
                <Label
                  htmlFor="space-discountType"
                  className="text-sm font-medium"
                >
                  固定割引
                </Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    value={discountType}
                    onValueChange={(value) =>
                      onDiscountTypeChange(
                        getValidDiscountType(value, DiscountType.NONE),
                      )
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger id="space-discountType" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DiscountType.NONE}>なし</SelectItem>
                      <SelectItem value={DiscountType.PERCENTAGE}>
                        パーセント割引
                      </SelectItem>
                      <SelectItem value={DiscountType.FIXED}>
                        定額割引
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {discountType === DiscountType.PERCENTAGE && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={discountValue}
                        onChange={(e) => onDiscountValueChange(e.target.value)}
                        placeholder="10"
                        min={0}
                        max={100}
                        className="w-20"
                        disabled={isPending}
                        aria-label="割引率"
                        aria-invalid={
                          fields.discountValue.errors ? true : undefined
                        }
                        aria-describedby={
                          fields.discountValue.errors
                            ? fields.discountValue.errorId
                            : undefined
                        }
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                  {discountType === DiscountType.FIXED && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={discountValue}
                        onChange={(e) => onDiscountValueChange(e.target.value)}
                        placeholder="500"
                        min={0}
                        className="w-24"
                        disabled={isPending}
                        aria-label="割引額"
                        aria-invalid={
                          fields.discountValue.errors ? true : undefined
                        }
                        aria-describedby={
                          fields.discountValue.errors
                            ? fields.discountValue.errorId
                            : undefined
                        }
                      />
                      <span className="text-sm text-muted-foreground">円</span>
                    </div>
                  )}
                </div>
                {fields.discountValue.errors && (
                  <p
                    id={fields.discountValue.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.discountValue.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="space-durationDiscountOverride"
                    className="text-sm font-medium"
                  >
                    長時間割引
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconHelpCircle
                          aria-hidden="true"
                          className="h-4 w-4 cursor-help text-muted-foreground"
                        />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          グローバル設定の長時間割引をスペース単位で上書きできます。
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={durationDiscountOverride}
                  onValueChange={(value) =>
                    onDurationDiscountOverrideChange(
                      getValidDurationDiscountOverride(
                        value,
                        DurationDiscountOverride.INHERIT,
                      ),
                    )
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="space-durationDiscountOverride">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DurationDiscountOverride.INHERIT}>
                      グローバル設定に従う
                    </SelectItem>
                    <SelectItem value={DurationDiscountOverride.ENABLED}>
                      このスペースは常に有効
                    </SelectItem>
                    <SelectItem value={DurationDiscountOverride.DISABLED}>
                      このスペースは無効
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h4 className="text-sm font-medium text-muted-foreground">
                税率設定
              </h4>
              <Select
                value={taxRateType}
                onValueChange={(value) =>
                  onTaxRateTypeChange(getValidTaxRateType(value))
                }
                disabled={isPending}
              >
                <SelectTrigger aria-label="税率タイプ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TaxRateType.STANDARD}>
                    標準税率（{taxSettings.standardRate}%）
                  </SelectItem>
                  <SelectItem value={TaxRateType.REDUCED}>
                    軽減税率（{taxSettings.reducedRate}%）
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hourlyPriceNum > 0 && (
              <div className="border-t pt-4">
                <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                  料金プレビュー
                  <span className="ml-2 font-normal">
                    （{getTaxRateLabel(taxRateType, currentTaxRate)}）
                  </span>
                </h4>
                <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">時間料金</span>
                    <div className="space-y-0.5 text-right">
                      {isPercentageDiscount && (
                        <div className="text-xs text-muted-foreground line-through">
                          {formatCurrency(hourlyPriceNum)}（税抜）
                        </div>
                      )}
                      <div className="text-sm">
                        {formatCurrency(
                          isPercentageDiscount
                            ? discountedHourlyPrice
                            : hourlyPriceNum,
                        )}
                        （税抜）
                      </div>
                      <div className="text-sm font-semibold text-primary">
                        {formatCurrency(
                          isPercentageDiscount
                            ? discountedTaxIncludedHourlyPrice
                            : taxIncludedHourlyPrice,
                        )}
                        （税込）
                      </div>
                    </div>
                  </div>
                  {hasDiscount && (
                    <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
                      割引:{" "}
                      {discountType === DiscountType.PERCENTAGE
                        ? `${discountValueNum ?? 0}% OFF`
                        : `${formatCurrency(discountValueNum ?? 0)}引（予約合計に適用）`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>料金プラン</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconHelpCircle
                      aria-hidden="true"
                      className="h-4 w-4 cursor-help text-muted-foreground"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      曜日・時間帯・期間ごとに異なる時間料金を設定できます。未設定の場合は上記の基本時間料金がそのまま適用されます。
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            {isEdit && space ? (
              <SpaceRatePlanList spaceId={space.id} plans={ratePlans} />
            ) : (
              <p
                className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground"
                aria-disabled="true"
              >
                スペースを作成すると、曜日・時間帯・期間ごとの料金プランを設定できるようになります。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
