"use client";

/**
 * SpaceCategory form
 *
 * Dialog 内 conform 化 PoC。`useForm` (@conform-to/react) を内側に持ち、
 * parent dialog から `lastResult` / `formAction` / `formId` / `isPending` を
 * 受け取る。`SubmitButton` は parent dialog footer に置かれ `form={formId}` で
 * connect する。
 *
 * - icon は `IconPickerField` + `useInputControl` で hidden input sync。
 * - color は `<input type="color">` と `<Input type="text">` の 2 入力を
 *   `useInputControl` で共通 state にバインドし、hidden input で送信値を確定。
 * - sortOrder はシステム管理（D&D 並び替えが SSoT）のためフォームに持たない。
 */

import type { SubmissionResult } from "@conform-to/react";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { Input, Textarea, Label } from "@/admin/components/ui";
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";
import {
  spaceCategoryFormSchema,
  type SpaceCategoryWithStats,
} from "@/shared/lib/validations/space-category";

type CategoryFormProps = {
  readonly category?: SpaceCategoryWithStats;
  readonly isPending: boolean;
  readonly lastResult: SubmissionResult | undefined;
  readonly formAction: (formData: FormData) => void;
  readonly formId: string;
};

export function CategoryForm({
  category,
  isPending,
  lastResult,
  formAction,
  formId,
}: CategoryFormProps) {
  const [form, fields] = useForm({
    id: formId,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: spaceCategoryFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: category
      ? {
          name: category.name,
          description: category.description ?? "",
          icon: category.icon ?? "",
          color: category.color ?? "",
        }
      : {
          name: "",
          description: "",
          icon: "",
          color: "",
        },
  });

  const iconControl = useInputControl(fields.icon);
  const colorControl = useInputControl(fields.color);
  const iconValue = iconControl.value ?? "";
  const colorValue = colorControl.value ?? "";
  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      <input type="hidden" name={fields.icon.name} value={iconValue} />
      <input type="hidden" name={fields.color.name} value={colorValue} />

      <div className="space-y-2">
        <Label htmlFor={fields.name.id}>カテゴリー名 *</Label>
        <Input
          {...getInputProps(fields.name, { type: "text" })}
          placeholder="例: 会議室"
          disabled={isPending}
        />
        {fields.name.errors && (
          <p id={fields.name.errorId} className="text-sm text-destructive">
            {fields.name.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.description.id}>説明</Label>
        <Textarea
          {...getTextareaProps(fields.description)}
          placeholder="カテゴリーの説明（オプション）"
          rows={3}
          disabled={isPending}
        />
        {fields.description.errors && (
          <p
            id={fields.description.errorId}
            className="text-sm text-destructive"
          >
            {fields.description.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={fields.icon.id}>アイコン</Label>
          <IconPickerField
            id={fields.icon.id}
            value={iconValue}
            onChange={(name) => iconControl.change(name)}
            disabled={isPending}
            aria-describedby={
              fields.icon.errors ? fields.icon.errorId : undefined
            }
          />
          {fields.icon.errors && (
            <p id={fields.icon.errorId} className="text-sm text-destructive">
              {fields.icon.errors.join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fields.color.id}>色</Label>
          <div className="flex items-center gap-2">
            <input
              id={fields.color.id}
              type="color"
              value={colorValue || "#000000"}
              onChange={(e) => colorControl.change(e.target.value)}
              onBlur={colorControl.blur}
              disabled={isPending}
              aria-label="カラーピッカー"
              aria-invalid={fields.color.errors ? true : undefined}
              aria-describedby={
                fields.color.errors ? fields.color.errorId : undefined
              }
              className="h-10 w-16 cursor-pointer rounded-md border border-input bg-background p-1"
            />
            <Input
              type="text"
              value={colorValue}
              onChange={(e) => colorControl.change(e.target.value)}
              onBlur={colorControl.blur}
              placeholder="#3B82F6"
              className="flex-1"
              disabled={isPending}
              aria-label="カラーコード"
              aria-invalid={fields.color.errors ? true : undefined}
              aria-describedby={
                fields.color.errors ? fields.color.errorId : undefined
              }
            />
          </div>
          {fields.color.errors && (
            <p id={fields.color.errorId} className="text-sm text-destructive">
              {fields.color.errors.join(", ")}
            </p>
          )}
        </div>
      </div>

      {formErrors && formErrors.length > 0 && (
        <div
          id={form.errorId}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {formErrors.join(", ")}
        </div>
      )}
    </form>
  );
}
