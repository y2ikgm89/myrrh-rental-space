"use client";

/**
 * AutoArrayField — useFieldArray ベースの配列フィールドリピーター
 */

import { useId } from "react";
import {
  useController,
  useFieldArray,
  type Control,
  type FieldValues,
  type UseFormRegister,
} from "react-hook-form";
import { z } from "zod";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Textarea,
} from "@/admin/components/ui";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";
import { PortableTextInlineEditor } from "@/admin/components/portable-text/inline-editor/PortableTextInlineEditor";
import { createSpanArraySchema } from "@/shared/lib/portable-text";
import {
  getArrayConstraints,
  getArrayItemShape,
  extractFieldMetaDeep,
  getSelectOptions,
} from "../zod-introspection";
import type { ArrayItemFieldInfo } from "../zod-introspection";
import { AutoImageField } from "./AutoImageField";

export function AutoArrayField({
  fieldKey,
  label,
  helpText,
  schema,
  control,
  register,
  isPending,
}: {
  readonly fieldKey: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly schema: z.ZodType;
  readonly control: Control<FieldValues>;
  readonly register: UseFormRegister<FieldValues>;
  readonly isPending: boolean;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldKey,
  });

  const itemShape = getArrayItemShape(schema);
  const itemFields: ArrayItemFieldInfo[] = itemShape
    ? Object.entries(itemShape).map(([k, s]) => ({
        key: k,
        schema: s,
        meta: extractFieldMetaDeep(s),
      }))
    : [];

  // schema 由来の min / max 制約（field.array({ min, max }) で登録されたもの）
  const { min, max } = getArrayConstraints(schema);
  const canAdd = max === undefined || fields.length < max;
  const canRemove = min === undefined || fields.length > min;
  const constraintHint = (() => {
    if (min !== undefined && max !== undefined) {
      return min === max ? `${min}件必須` : `${min}〜${max}件`;
    }
    if (max !== undefined) return `最大${max}件`;
    if (min !== undefined) return `最低${min}件`;
    return null;
  })();

  // 新しいアイテムのデフォルト値を生成
  const createEmptyItem = (): Record<string, unknown> => {
    const empty: Record<string, unknown> = {};
    for (const f of itemFields) {
      if (f.meta) {
        switch (f.meta.fieldType) {
          case "boolean":
            empty[f.key] = false;
            break;
          case "number":
            empty[f.key] = 0;
            break;
          case "portable-text-inline":
            empty[f.key] = [];
            break;
          default:
            empty[f.key] = "";
        }
      } else {
        empty[f.key] = "";
      }
    }
    return empty;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <Label>{label}</Label>
          {constraintHint ? (
            <span className="text-xs text-muted-foreground">
              ({constraintHint})
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(createEmptyItem())}
          disabled={isPending || !canAdd}
          aria-label={
            !canAdd && max !== undefined
              ? `最大 ${max} 件のため追加できません`
              : undefined
          }
        >
          <IconPlus className="h-3 w-3 mr-1" />
          追加
        </Button>
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {fields.length === 0 && (
        <div className="flex items-center justify-center py-8 border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">
            アイテムが追加されていません
          </p>
        </div>
      )}
      {fields.map((field, index) => (
        <Card key={field.id}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">#{index + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                disabled={isPending || !canRemove}
                aria-label={
                  !canRemove && min !== undefined
                    ? `最低 ${min} 件必要なため削除できません`
                    : undefined
                }
              >
                <IconTrash className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            {itemFields.map((itemField) => (
              <ArrayItemField
                key={itemField.key}
                parentKey={fieldKey}
                index={index}
                itemField={itemField}
                register={register}
                control={control}
                isPending={isPending}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ArrayItemField({
  parentKey,
  index,
  itemField,
  register,
  control,
  isPending,
}: {
  readonly parentKey: string;
  readonly index: number;
  readonly itemField: ArrayItemFieldInfo;
  readonly register: UseFormRegister<FieldValues>;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
}) {
  const fieldName = `${parentKey}.${index}.${itemField.key}`;
  const meta = itemField.meta;
  const itemLabel = meta?.label ?? itemField.key;
  const fieldType = meta?.fieldType ?? "text";

  if (fieldType === "textarea") {
    return (
      <div className="space-y-2">
        <Label>{itemLabel}</Label>
        <Textarea
          {...register(fieldName)}
          placeholder={meta?.placeholder}
          rows={2}
          disabled={isPending}
        />
      </div>
    );
  }

  if (fieldType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input type="checkbox" {...register(fieldName)} disabled={isPending} />
        <Label>{itemLabel}</Label>
      </div>
    );
  }

  if (fieldType === "number") {
    return (
      <div className="space-y-2">
        <Label>{itemLabel}</Label>
        <Input
          type="number"
          {...register(fieldName, { valueAsNumber: true })}
          disabled={isPending}
        />
      </div>
    );
  }

  if (fieldType === "image") {
    return (
      <ArrayItemImageField
        fieldName={fieldName}
        label={itemLabel}
        helpText={meta?.helpText}
        control={control}
        isPending={isPending}
      />
    );
  }

  if (fieldType === "icon") {
    return (
      <ArrayItemIconField
        fieldName={fieldName}
        label={itemLabel}
        helpText={meta?.helpText}
        control={control}
        isPending={isPending}
      />
    );
  }

  if (fieldType === "portable-text-inline") {
    return (
      <ArrayItemRichLabelField
        fieldName={fieldName}
        label={itemLabel}
        helpText={meta?.helpText}
        control={control}
        isPending={isPending}
      />
    );
  }

  if (fieldType === "select") {
    // 配列内アイテムの select は簡略化して Input にフォールバック
    const options = getSelectOptions(itemField.schema);
    if (options.length > 0) {
      return (
        <ArrayItemSelectField
          fieldName={fieldName}
          label={itemLabel}
          options={options}
          register={register}
          isPending={isPending}
        />
      );
    }
  }

  // text, url, color — テキスト入力
  return (
    <div className="space-y-2">
      <Label>{itemLabel}</Label>
      <Input
        type={fieldType === "url" ? "url" : "text"}
        {...register(fieldName)}
        placeholder={meta?.placeholder}
        disabled={isPending}
        {...(meta?.leadingIcon !== undefined && {
          leadingIcon: meta.leadingIcon,
        })}
        {...(meta?.trailingIcon !== undefined && {
          trailingIcon: meta.trailingIcon,
        })}
      />
    </div>
  );
}

function ArrayItemImageField({
  fieldName,
  label,
  helpText,
  control,
  isPending,
}: {
  readonly fieldName: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
}) {
  const id = useId();
  const { field } = useController({ control, name: fieldName });

  return (
    <AutoImageField
      fieldId={id}
      label={label}
      value={typeof field.value === "string" ? field.value : undefined}
      onSelect={(url) => field.onChange(url)}
      {...(helpText !== undefined && { helpText })}
      {...(isPending && { disabled: true })}
    />
  );
}

function ArrayItemIconField({
  fieldName,
  label,
  helpText,
  control,
  isPending,
}: {
  readonly fieldName: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
}) {
  const id = useId();
  const { field } = useController({ control, name: fieldName });
  const value = typeof field.value === "string" ? field.value : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <IconPickerField
        id={id}
        value={value}
        onChange={(name) => field.onChange(name)}
        disabled={isPending}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}

function ArrayItemRichLabelField({
  fieldName,
  label,
  helpText,
  control,
  isPending,
}: {
  readonly fieldName: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
}) {
  const id = useId();
  const { field } = useController({ control, name: fieldName });
  const parsed = createSpanArraySchema().safeParse(field.value);
  const value = parsed.success ? parsed.data : [];

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <PortableTextInlineEditor
        id={id}
        value={value}
        onChange={(tokens) => field.onChange(tokens)}
        disabled={isPending}
        aria-label={label}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}

function ArrayItemSelectField({
  fieldName,
  label,
  options,
  register,
  isPending,
}: {
  readonly fieldName: string;
  readonly label: string;
  readonly options: readonly string[];
  readonly register: UseFormRegister<FieldValues>;
  readonly isPending: boolean;
}) {
  const id = useId();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        {...register(fieldName)}
        disabled={isPending}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
