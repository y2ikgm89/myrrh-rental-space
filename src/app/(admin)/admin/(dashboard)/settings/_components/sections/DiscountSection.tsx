"use client";

/**
 * 割引設定セクション
 *
 * 長時間割引ルールと割引併用モードの設定
 */

import { useFieldArray, useWatch } from "react-hook-form";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  Button,
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
  Switch,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateDiscountSettings,
  type DiscountSettingsData,
} from "@/admin/actions/settings";
import { discountFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { DiscountCombinationMode } from "@generated/prisma/enums";

interface DiscountSectionProps {
  settings: DiscountSettingsData;
}

export function DiscountSection({ settings }: DiscountSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    discountFormSchema,
    (data) => updateDiscountSettings(data),
    {
      defaultValues: {
        durationDiscountEnabled: settings.durationDiscountEnabled,
        durationDiscountRules:
          settings.durationDiscountRules.length > 0
            ? settings.durationDiscountRules
            : [{ hours: 4, discountRate: 10 }],
        discountCombinationMode: settings.discountCombinationMode,
        showOriginalPrice: settings.showOriginalPrice,
        discountWarningEnabled: settings.discountWarningEnabled,
      },
      refresh: true,
      successMessage: "割引設定を更新しました",
    },
  );

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "durationDiscountRules",
  });

  const durationDiscountEnabled = useWatch({
    control: form.control,
    name: "durationDiscountEnabled",
  });

  const discountCombinationMode = useWatch({
    control: form.control,
    name: "discountCombinationMode",
  });

  const addRule = () => {
    const rules = form.getValues("durationDiscountRules");
    const maxHours = Math.max(...rules.map((r) => r.hours), 0);
    append({ hours: maxHours + 2, discountRate: 5 });
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        {/* 長時間割引設定 */}
        <Card>
          <CardHeader>
            <CardTitle>長時間割引</CardTitle>
            <CardDescription>
              指定時間以上の予約に自動で割引を適用します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 有効/無効スイッチ */}
            <FormField
              control={form.control}
              name="durationDiscountEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>長時間割引を有効にする</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      無効にすると全ての長時間割引が適用されません
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* 割引ルール一覧 */}
            {durationDiscountEnabled && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <FormLabel>割引ルール</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRule}
                    disabled={isPending}
                  >
                    <IconPlus className="mr-1 h-4 w-4" />
                    ルールを追加
                  </Button>
                </div>

                <div className="space-y-3">
                  {fields.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="flex-1 grid gap-3 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`durationDiscountRules.${index}.hours`}
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center gap-2">
                                <FormControl>
                                  <Input
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.valueAsNumber || 1,
                                      )
                                    }
                                    type="number"
                                    min={1}
                                    max={24}
                                    className="w-20"
                                    disabled={isPending}
                                  />
                                </FormControl>
                                <span className="text-sm text-muted-foreground">
                                  時間以上で
                                </span>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`durationDiscountRules.${index}.discountRate`}
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center gap-2">
                                <FormControl>
                                  <Input
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.valueAsNumber || 1,
                                      )
                                    }
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="w-20"
                                    disabled={isPending}
                                  />
                                </FormControl>
                                <span className="text-sm text-muted-foreground">
                                  % OFF
                                </span>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        disabled={isPending || fields.length <= 1}
                        className="text-destructive hover:text-destructive"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  複数のルールがある場合、最も長い時間のルールが優先されます
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 割引併用設定 */}
        <Card>
          <CardHeader>
            <CardTitle>割引併用設定</CardTitle>
            <CardDescription>
              長時間割引とクーポン割引の併用方法を設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="discountCombinationMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>割引の併用モード</FormLabel>
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
                      <SelectItem value={DiscountCombinationMode.best}>
                        最もお得な割引のみ適用
                      </SelectItem>
                      <SelectItem value={DiscountCombinationMode.both}>
                        両方の割引を適用
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {discountCombinationMode === DiscountCombinationMode.best
                      ? "長時間割引とクーポンのうち、割引額が大きい方のみ適用されます"
                      : "長時間割引とクーポンの両方が適用されます（クーポンの併用設定が優先されます）"}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="showOriginalPrice"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>元の価格を表示</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      割引適用時に元の価格を取り消し線で表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="discountWarningEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>割引適用時に警告を表示</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      割引が自動適用された際に警告メッセージを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 保存ボタン */}
        <div className="flex justify-end pt-2">
          <SubmitButton
            isPending={isPending}
            label="割引設定を保存"
            disabled={!form.formState.isDirty}
          />
        </div>
      </form>
    </Form>
  );
}
