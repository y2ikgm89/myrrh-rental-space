"use client";

/**
 * 消費税設定セクション
 *
 * 税率と価格表示モードの設定
 */

import { useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateTaxSettings,
  type TaxSettingsData,
} from "@/admin/actions/settings";
import { taxFormSchema } from "@/admin/actions/settings/schemas/form-schemas-booking-tax-terms";
import { TaxDisplayMode, TaxInputMode } from "@generated/prisma/enums";

interface TaxSectionProps {
  settings: TaxSettingsData;
}

export function TaxSection({ settings }: TaxSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    taxFormSchema,
    (data) => updateTaxSettings(data),
    {
      defaultValues: {
        taxStandardRate: settings.standardRate,
        taxReducedRate: settings.reducedRate,
        taxDisplayModeAdmin: settings.displayModeAdmin,
        taxDisplayModePublic: settings.displayModePublic,
        taxInputMode: settings.inputMode,
      },
      refresh: true,
      successMessage: "消費税設定を更新しました",
    },
  );

  const taxInputMode = useWatch({
    control: form.control,
    name: "taxInputMode",
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        {/* 税率設定 */}
        <Card>
          <CardHeader>
            <CardTitle>税率設定</CardTitle>
            <CardDescription>標準税率と軽減税率を設定します</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="taxStandardRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>標準税率</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          className="w-24"
                          disabled={isPending}
                        />
                      </FormControl>
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      通常の商品・サービスに適用される税率です
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="taxReducedRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>軽減税率</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          className="w-24"
                          disabled={isPending}
                        />
                      </FormControl>
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      飲食料品など軽減税率対象に適用される税率です
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* 価格入力モード */}
        <Card>
          <CardHeader>
            <CardTitle>価格入力モード</CardTitle>
            <CardDescription>
              管理画面での価格入力方法を設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="taxInputMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>価格の入力方法</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full sm:w-[300px]">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={TaxInputMode.tax_excluded}>
                        税抜き価格で入力
                      </SelectItem>
                      <SelectItem value={TaxInputMode.tax_included}>
                        税込み価格で入力
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {taxInputMode === TaxInputMode.tax_excluded
                      ? "入力した価格は税抜き価格として保存され、表示時に税込み価格が計算されます"
                      : "入力した価格は税込み価格として扱われ、内部で税抜き価格に換算して保存されます"}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 価格表示モード */}
        <Card>
          <CardHeader>
            <CardTitle>価格表示設定</CardTitle>
            <CardDescription>
              管理画面と公開ページでの価格表示方法を設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="taxDisplayModeAdmin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>管理画面での価格表示</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full sm:w-[300px]">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={TaxDisplayMode.tax_excluded}>
                        税抜き価格のみ
                      </SelectItem>
                      <SelectItem value={TaxDisplayMode.tax_included}>
                        税込み価格のみ
                      </SelectItem>
                      <SelectItem value={TaxDisplayMode.both}>
                        両方表示
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="taxDisplayModePublic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>公開ページでの価格表示</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full sm:w-[300px]">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={TaxDisplayMode.tax_excluded}>
                        税抜き価格のみ
                      </SelectItem>
                      <SelectItem value={TaxDisplayMode.tax_included}>
                        税込み価格のみ
                      </SelectItem>
                      <SelectItem value={TaxDisplayMode.both}>
                        両方表示
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    お客様が閲覧する公開ページでの価格表示形式です
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 保存ボタン */}
        <div className="flex justify-end pt-2">
          <SubmitButton
            isPending={isPending}
            label="消費税設定を保存"
            disabled={!form.formState.isDirty}
          />
        </div>
      </form>
    </Form>
  );
}
