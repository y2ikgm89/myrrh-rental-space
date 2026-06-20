"use client";

/**
 * 消費税設定セクション
 *
 * 税率と価格表示モードの設定
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import type { FieldMetadata } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { updateTaxSettings, type TaxSettings } from "@/admin/actions/settings";
import { taxFormSchema } from "@/admin/actions/settings/schemas/form-schemas-booking-tax-terms";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";

interface TaxSectionProps {
  settings: TaxSettings;
}

type DisplayModeSelectProps = {
  field: FieldMetadata<string>;
  label: string;
  helperText?: string;
  disabled: boolean;
};

function DisplayModeSelect({
  field,
  label,
  helperText,
  disabled,
}: DisplayModeSelectProps) {
  const control = useInputControl(field);
  return (
    <div className="space-y-1.5">
      <label
        className="block text-sm font-medium text-foreground"
        htmlFor={field.id}
      >
        {label}
      </label>
      <Select
        value={control.value ?? ""}
        onValueChange={(v) => control.change(v)}
        disabled={disabled}
      >
        <SelectTrigger
          id={field.id}
          className="w-full sm:w-[300px]"
          onBlur={control.blur}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TaxDisplayMode.tax_excluded}>
            税抜き価格のみ
          </SelectItem>
          <SelectItem value={TaxDisplayMode.tax_included}>
            税込み価格のみ
          </SelectItem>
          <SelectItem value={TaxDisplayMode.both}>両方表示</SelectItem>
        </SelectContent>
      </Select>
      <input type="hidden" name={field.name} value={control.value ?? ""} />
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

export function TaxSection({ settings }: TaxSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateTaxSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "tax-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: taxFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      taxStandardRate: String(settings.standardRate),
      taxReducedRate: String(settings.reducedRate),
      taxDisplayModePublic: settings.displayModePublic,
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("消費税設定を更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>税率設定</CardTitle>
          <CardDescription>標準税率と軽減税率を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor={fields.taxStandardRate.id}
              >
                標準税率
              </label>
              <div className="flex items-center gap-2">
                <Input
                  {...getInputProps(fields.taxStandardRate, { type: "number" })}
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-24"
                  disabled={isPending}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                通常の商品・サービスに適用される税率です
              </p>
              {fields.taxStandardRate.errors &&
                fields.taxStandardRate.errors.length > 0 && (
                  <p
                    id={fields.taxStandardRate.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.taxStandardRate.errors.join(", ")}
                  </p>
                )}
            </div>
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor={fields.taxReducedRate.id}
              >
                軽減税率
              </label>
              <div className="flex items-center gap-2">
                <Input
                  {...getInputProps(fields.taxReducedRate, { type: "number" })}
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-24"
                  disabled={isPending}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                飲食料品など軽減税率対象に適用される税率です
              </p>
              {fields.taxReducedRate.errors &&
                fields.taxReducedRate.errors.length > 0 && (
                  <p
                    id={fields.taxReducedRate.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.taxReducedRate.errors.join(", ")}
                  </p>
                )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>価格表示設定</CardTitle>
          <CardDescription>
            公開ページでの価格表示方法を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DisplayModeSelect
            field={fields.taxDisplayModePublic}
            label="公開ページでの価格表示"
            helperText="お客様が閲覧する公開ページでの価格表示形式です"
            disabled={isPending}
          />
        </CardContent>
      </Card>

      {formErrors && formErrors.length > 0 && (
        <div
          id={form.errorId}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {formErrors.join(", ")}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <SubmitButton
          isPending={isPending}
          label="消費税設定を保存"
          pendingLabel="保存中..."
        />
      </div>
    </form>
  );
}
