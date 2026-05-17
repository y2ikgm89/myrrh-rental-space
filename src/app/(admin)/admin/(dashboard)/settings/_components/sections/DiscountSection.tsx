"use client";

/**
 * 割引設定セクション
 *
 * 長時間割引ルールと割引併用モードの設定。
 * RHF useFieldArray から完全移行。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import {
  updateDiscountSettings,
  type DiscountSettingsData,
} from "@/admin/actions/settings";
import { discountFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { DiscountCombinationMode } from "@/shared/lib/validations/enums/prisma-types";
import { isValidDiscountCombinationMode } from "@/shared/lib/validations/enums/guards";

interface DiscountSectionProps {
  settings: DiscountSettingsData;
}

export function DiscountSection({ settings }: DiscountSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateDiscountSettings,
    undefined,
  );

  const initialRules =
    settings.durationDiscountRules.length > 0
      ? settings.durationDiscountRules
      : [{ hours: 4, discountRate: 10 }];

  const [form, fields] = useForm({
    id: "discount-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: discountFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      durationDiscountEnabled: settings.durationDiscountEnabled ? "on" : "",
      durationDiscountRules: initialRules.map((rule) => ({
        hours: String(rule.hours),
        discountRate: String(rule.discountRate),
      })),
      discountCombinationMode: settings.discountCombinationMode,
      showOriginalPrice: settings.showOriginalPrice ? "on" : "",
      discountWarningEnabled: settings.discountWarningEnabled ? "on" : "",
    },
  });

  const durationDiscountEnabledControl = useInputControl(
    fields.durationDiscountEnabled,
  );
  const combinationModeControl = useInputControl(
    fields.discountCombinationMode,
  );
  const showOriginalPriceControl = useInputControl(fields.showOriginalPrice);
  const discountWarningEnabledControl = useInputControl(
    fields.discountWarningEnabled,
  );

  const durationDiscountEnabled = durationDiscountEnabledControl.value === "on";
  const combinationMode =
    combinationModeControl.value ?? settings.discountCombinationMode;
  const showOriginalPrice = showOriginalPriceControl.value === "on";
  const discountWarningEnabled = discountWarningEnabledControl.value === "on";

  const ruleFields = fields.durationDiscountRules.getFieldList();

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("割引設定を更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;
  const ruleArrayErrors = fields.durationDiscountRules.errors;

  // 既存ルールの最大時間を計算して、新規追加時のデフォルト値に使う
  const maxHours = Math.max(
    ...ruleFields.flatMap((rf) => {
      const initial = rf.getFieldset().hours.initialValue;
      if (typeof initial !== "string") return [];
      const parsed = parseInt(initial, 10);
      return Number.isFinite(parsed) ? [parsed] : [];
    }),
    0,
  );

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <input
        type="hidden"
        name={fields.durationDiscountEnabled.name}
        value={durationDiscountEnabledControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.discountCombinationMode.name}
        value={combinationMode}
      />
      <input
        type="hidden"
        name={fields.showOriginalPrice.name}
        value={showOriginalPriceControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.discountWarningEnabled.name}
        value={discountWarningEnabledControl.value ?? ""}
      />

      {/* 長時間割引設定 */}
      <Card>
        <CardHeader>
          <CardTitle>長時間割引</CardTitle>
          <CardDescription>
            指定時間以上の予約に自動で割引を適用します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={fields.durationDiscountEnabled.id}>
                長時間割引を有効にする
              </Label>
              <p className="text-xs text-muted-foreground">
                無効にすると全ての長時間割引が適用されません
              </p>
            </div>
            <Switch
              id={fields.durationDiscountEnabled.id}
              checked={durationDiscountEnabled}
              onCheckedChange={(checked) =>
                durationDiscountEnabledControl.change(checked ? "on" : "")
              }
              disabled={isPending}
            />
          </div>

          {durationDiscountEnabled && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">割引ルール</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  {...form.insert.getButtonProps({
                    name: fields.durationDiscountRules.name,
                    defaultValue: {
                      hours: String(maxHours + 2),
                      discountRate: "5",
                    },
                  })}
                  disabled={isPending}
                >
                  <IconPlus className="mr-1 h-4 w-4" aria-hidden="true" />
                  ルールを追加
                </Button>
              </div>

              <div className="space-y-3">
                {ruleFields.map((ruleField, index) => {
                  const ruleFieldset = ruleField.getFieldset();
                  return (
                    <div
                      key={ruleField.key}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="flex-1 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Input
                              {...getInputProps(ruleFieldset.hours, {
                                type: "number",
                              })}
                              min={1}
                              max={24}
                              className="w-20"
                              disabled={isPending}
                              aria-label={`ルール ${index + 1} 時間`}
                            />
                            <span className="text-sm text-muted-foreground">
                              時間以上で
                            </span>
                          </div>
                          {ruleFieldset.hours.errors && (
                            <p className="text-xs text-destructive">
                              {ruleFieldset.hours.errors.join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Input
                              {...getInputProps(ruleFieldset.discountRate, {
                                type: "number",
                              })}
                              min={1}
                              max={100}
                              className="w-20"
                              disabled={isPending}
                              aria-label={`ルール ${index + 1} 割引率`}
                            />
                            <span className="text-sm text-muted-foreground">
                              % OFF
                            </span>
                          </div>
                          {ruleFieldset.discountRate.errors && (
                            <p className="text-xs text-destructive">
                              {ruleFieldset.discountRate.errors.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="destructive-ghost"
                        size="sm"
                        {...form.remove.getButtonProps({
                          name: fields.durationDiscountRules.name,
                          index,
                        })}
                        disabled={isPending || ruleFields.length <= 1}
                        aria-label={`ルール ${index + 1} を削除`}
                      >
                        <IconTrash className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {ruleArrayErrors && ruleArrayErrors.length > 0 && (
                <p
                  id={fields.durationDiscountRules.errorId}
                  className="text-sm text-destructive"
                >
                  {ruleArrayErrors.join(", ")}
                </p>
              )}

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
          <div className="space-y-2">
            <Label htmlFor={fields.discountCombinationMode.id}>
              割引の併用モード
            </Label>
            <Select
              value={combinationMode}
              onValueChange={(value) => {
                if (isValidDiscountCombinationMode(value)) {
                  combinationModeControl.change(value);
                }
              }}
              disabled={isPending}
            >
              <SelectTrigger
                id={fields.discountCombinationMode.id}
                className="w-full sm:w-[300px]"
              >
                <SelectValue />
              </SelectTrigger>
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
              {combinationMode === DiscountCombinationMode.best
                ? "長時間割引とクーポンのうち、割引額が大きい方のみ適用されます"
                : "長時間割引とクーポンの両方が適用されます（クーポンの併用設定が優先されます）"}
            </p>
            {fields.discountCombinationMode.errors && (
              <p
                id={fields.discountCombinationMode.errorId}
                className="text-sm text-destructive"
              >
                {fields.discountCombinationMode.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={fields.showOriginalPrice.id}>
                元の価格を表示
              </Label>
              <p className="text-xs text-muted-foreground">
                割引適用時に元の価格を取り消し線で表示します
              </p>
            </div>
            <Switch
              id={fields.showOriginalPrice.id}
              checked={showOriginalPrice}
              onCheckedChange={(checked) =>
                showOriginalPriceControl.change(checked ? "on" : "")
              }
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={fields.discountWarningEnabled.id}>
                割引適用時に警告を表示
              </Label>
              <p className="text-xs text-muted-foreground">
                割引が自動適用された際に警告メッセージを表示します
              </p>
            </div>
            <Switch
              id={fields.discountWarningEnabled.id}
              checked={discountWarningEnabled}
              onCheckedChange={(checked) =>
                discountWarningEnabledControl.change(checked ? "on" : "")
              }
              disabled={isPending}
            />
          </div>
        </CardContent>
      </Card>

      {formErrors && formErrors.length > 0 && (
        <div
          id={form.errorId}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formErrors.join(", ")}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <SubmitButton
          isPending={isPending}
          label="割引設定を保存"
          pendingLabel="保存中..."
        />
      </div>
    </form>
  );
}
