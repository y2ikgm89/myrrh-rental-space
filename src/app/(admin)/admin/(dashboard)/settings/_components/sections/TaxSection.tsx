"use client";

/**
 * 消費税設定セクション
 *
 * 税率と価格表示モードの設定
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
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
import { updateTaxSettings } from "@/admin/actions/settings";
import type { AdminTaxSettings } from "@/shared/domain/settings/types";
import type { Serialized } from "@/shared/lib/serialize";
import { taxSettingsSchema } from "@/admin/actions/settings/schemas/discount";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import {
  HiddenControlInput,
  useFieldControl,
} from "@/shared/lib/conform/control";

interface TaxSectionProps {
  settings: Serialized<AdminTaxSettings>;
}

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

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
  const control = useFieldControl(field);
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
          <SelectItem value={TaxDisplayMode.TAX_EXCLUDED}>
            税抜き価格のみ
          </SelectItem>
          <SelectItem value={TaxDisplayMode.TAX_INCLUDED}>
            税込み価格のみ
          </SelectItem>
          <SelectItem value={TaxDisplayMode.BOTH}>両方表示</SelectItem>
        </SelectContent>
      </Select>
      <HiddenControlInput field={field} control={control} />
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
      return parseWithZod(formData, { schema: taxSettingsSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      taxStandardRate: String(settings.standardRate),
      taxReducedRate: String(settings.reducedRate),
      taxDisplayModePublic: settings.displayModePublic,
      expectedUpdatedAt: settings.commerceUpdatedAt,
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("消費税設定を更新しました");
      router.refresh();
      return;
    }
    if (lastResult?.status === "error") {
      const formLevelErrors = lastResult.error?.[""];
      const conflictMessage = formLevelErrors?.find((message) =>
        message.includes(OPTIMISTIC_CONFLICT_HINT),
      );
      if (conflictMessage) {
        toast.error(conflictMessage);
        router.refresh();
      }
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <input {...getInputProps(fields.expectedUpdatedAt, { type: "hidden" })} />
      <Card>
        <CardHeader>
          <CardTitle>税率設定</CardTitle>
          <CardDescription>
            標準税率と軽減税率を設定します。イベントチケット料金は本設定の対象外で、
            チケット価格は税込固定・領収書は 10% 内税として逆算されます。
          </CardDescription>
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
