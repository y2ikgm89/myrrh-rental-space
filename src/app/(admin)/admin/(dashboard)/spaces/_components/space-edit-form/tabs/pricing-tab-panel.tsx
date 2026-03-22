"use client";

import { HelpCircle } from "lucide-react";
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
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
import {
  calculateTaxIncludedPrice,
  getTaxRate,
} from "@/shared/lib/pricing/tax";
import { getTaxRateLabel } from "@/shared/lib/pricing/format";
import type { TaxSettings } from "@/shared/lib/pricing/types";
import {
  getValidTaxRateType,
  getValidDiscountType,
  getValidDurationDiscountOverride,
} from "@/shared/lib/validations/enums/helpers";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/db/enums";
import type { SpaceEditFormData } from "../schema";

type SpaceEditPricingTabPanelProps = {
  control: Control<SpaceEditFormData>;
  register: UseFormRegister<SpaceEditFormData>;
  setValue: UseFormSetValue<SpaceEditFormData>;
  errors: FieldErrors<SpaceEditFormData>;
  isPending: boolean;
  taxSettings: TaxSettings;
};

export function SpaceEditPricingTabPanel({
  control,
  register,
  setValue,
  errors,
  isPending,
  taxSettings,
}: SpaceEditPricingTabPanelProps) {
  const discountType = useWatch({ control, name: "discountType" });
  const discountValue = useWatch({ control, name: "discountValue" });
  const durationDiscountOverride = useWatch({
    control,
    name: "durationDiscountOverride",
  });
  const taxRateType = useWatch({ control, name: "taxRateType" });
  const hourlyPrice = useWatch({ control, name: "hourlyPrice" });
  const dailyPrice = useWatch({ control, name: "dailyPrice" });

  const calculateDiscountedPrice = (price: number): number => {
    if (!price || discountType === DiscountType.none || !discountValue)
      return price;
    if (discountType === DiscountType.percentage)
      return Math.round(price * (1 - discountValue / 100));
    if (discountType === DiscountType.fixed)
      return Math.max(0, price - discountValue);
    return price;
  };
  const discountedHourlyPrice = calculateDiscountedPrice(hourlyPrice || 0);
  const discountedDailyPrice = dailyPrice
    ? calculateDiscountedPrice(dailyPrice)
    : null;
  const hasDiscount =
    discountType !== DiscountType.none && discountValue && discountValue > 0;
  const currentTaxRate = getTaxRate(taxRateType, taxSettings);
  const taxIncludedHourlyPrice = calculateTaxIncludedPrice(
    hourlyPrice || 0,
    currentTaxRate,
  );
  const taxIncludedDailyPrice = dailyPrice
    ? calculateTaxIncludedPrice(dailyPrice, currentTaxRate)
    : null;
  const discountedTaxIncludedHourlyPrice = calculateTaxIncludedPrice(
    discountedHourlyPrice,
    currentTaxRate,
  );
  const discountedTaxIncludedDailyPrice =
    discountedDailyPrice !== null
      ? calculateTaxIncludedPrice(discountedDailyPrice, currentTaxRate)
      : null;

  return (
    <TabsContent
      value="pricing"
      forceMount
      className="data-[state=inactive]:hidden"
    >
      <Card>
        <CardHeader>
          <CardTitle>料金設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hourlyPrice">時間料金（円/時間）*</Label>
              <Input
                id="hourlyPrice"
                type="number"
                {...register("hourlyPrice", { valueAsNumber: true })}
                placeholder="5000"
                disabled={isPending}
              />
              {errors.hourlyPrice && (
                <p className="text-sm text-destructive">
                  {errors.hourlyPrice.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyPrice">日額料金（円/日）</Label>
              <Input
                id="dailyPrice"
                type="number"
                {...register("dailyPrice", {
                  setValueAs: (v: string) => (v === "" ? null : Number(v)),
                })}
                placeholder="30000"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              割引設定
            </h4>

            <div className="space-y-2">
              <Label htmlFor="discountType" className="text-sm font-medium">
                固定割引
              </Label>
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={discountType}
                  onValueChange={(value) => {
                    const validated = getValidDiscountType(
                      value,
                      DiscountType.none,
                    );
                    setValue("discountType", validated, {
                      shouldDirty: true,
                    });
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger id="discountType" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DiscountType.none}>なし</SelectItem>
                    <SelectItem value={DiscountType.percentage}>
                      パーセント割引
                    </SelectItem>
                    <SelectItem value={DiscountType.fixed}>定額割引</SelectItem>
                  </SelectContent>
                </Select>
                {discountType === DiscountType.percentage && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      {...register("discountValue", {
                        setValueAs: (v: string) =>
                          v === "" ? null : Number(v),
                      })}
                      placeholder="10"
                      className="w-20"
                      disabled={isPending}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
                {discountType === DiscountType.fixed && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      {...register("discountValue", {
                        setValueAs: (v: string) =>
                          v === "" ? null : Number(v),
                      })}
                      placeholder="500"
                      className="w-24"
                      disabled={isPending}
                    />
                    <span className="text-sm text-muted-foreground">円</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="durationDiscountOverride"
                  className="text-sm font-medium"
                >
                  長時間割引
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 cursor-help text-muted-foreground" />
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
                onValueChange={(value) => {
                  const validated = getValidDurationDiscountOverride(
                    value,
                    DurationDiscountOverride.inherit,
                  );
                  setValue("durationDiscountOverride", validated, {
                    shouldDirty: true,
                  });
                }}
                disabled={isPending}
              >
                <SelectTrigger id="durationDiscountOverride">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DurationDiscountOverride.inherit}>
                    グローバル設定に従う
                  </SelectItem>
                  <SelectItem value={DurationDiscountOverride.enabled}>
                    このスペースは常に有効
                  </SelectItem>
                  <SelectItem value={DurationDiscountOverride.disabled}>
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
              onValueChange={(value) => {
                const validated = getValidTaxRateType(value);
                setValue("taxRateType", validated, { shouldDirty: true });
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TaxRateType.standard}>
                  標準税率（{taxSettings.standardRate}%）
                </SelectItem>
                <SelectItem value={TaxRateType.reduced}>
                  軽減税率（{taxSettings.reducedRate}%）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hourlyPrice > 0 && (
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
                    {hasDiscount && (
                      <div className="text-xs text-muted-foreground line-through">
                        ¥{hourlyPrice.toLocaleString()}（税抜）
                      </div>
                    )}
                    <div className="text-sm">
                      ¥
                      {(hasDiscount
                        ? discountedHourlyPrice
                        : hourlyPrice
                      ).toLocaleString()}
                      （税抜）
                    </div>
                    <div className="text-sm font-semibold text-primary">
                      ¥
                      {(hasDiscount
                        ? discountedTaxIncludedHourlyPrice
                        : taxIncludedHourlyPrice
                      ).toLocaleString()}
                      （税込）
                    </div>
                  </div>
                </div>
                {dailyPrice && (
                  <div className="flex items-center justify-between border-t border-border/50 pt-2">
                    <span className="text-sm">日額料金</span>
                    <div className="space-y-0.5 text-right">
                      {hasDiscount && discountedDailyPrice !== null && (
                        <div className="text-xs text-muted-foreground line-through">
                          ¥{dailyPrice.toLocaleString()}（税抜）
                        </div>
                      )}
                      <div className="text-sm">
                        ¥
                        {(hasDiscount && discountedDailyPrice !== null
                          ? discountedDailyPrice
                          : dailyPrice
                        ).toLocaleString()}
                        （税抜）
                      </div>
                      <div className="text-sm font-semibold text-primary">
                        ¥
                        {(
                          discountedTaxIncludedDailyPrice ??
                          taxIncludedDailyPrice ??
                          0
                        ).toLocaleString()}
                        （税込）
                      </div>
                    </div>
                  </div>
                )}
                {hasDiscount && (
                  <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
                    割引:{" "}
                    {discountType === DiscountType.percentage
                      ? `${discountValue}% OFF`
                      : `¥${discountValue?.toLocaleString()}引`}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
