"use client";

/**
 * AutoArrayField — useFieldArray ベースの配列フィールドリピーター
 */

import { useId } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import {
  getArrayItemShape,
  extractFieldMetaDeep,
  getSelectOptions,
} from "../zod-introspection";
import type { ArrayItemFieldInfo } from "../zod-introspection";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly control: ReturnType<typeof useForm<any>>["control"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly register: ReturnType<typeof useForm<any>>["register"];
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
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(createEmptyItem())}
          disabled={isPending}
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
                disabled={isPending}
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
  isPending,
}: {
  readonly parentKey: string;
  readonly index: number;
  readonly itemField: ArrayItemFieldInfo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly register: ReturnType<typeof useForm<any>>["register"];
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

  // text, icon, url, image, color — すべてテキスト入力
  return (
    <div className="space-y-2">
      <Label>{itemLabel}</Label>
      <Input
        type={fieldType === "url" ? "url" : "text"}
        {...register(fieldName)}
        placeholder={meta?.placeholder}
        disabled={isPending}
      />
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly register: ReturnType<typeof useForm<any>>["register"];
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
