"use client";

/**
 * AutoGroupField — 折りたたみ可能なグループフィールド
 *
 * Phase 3-A conform 移行: FieldMetadata.getFieldset() で nested object のサブ
 * フィールドアクセサを取得。循環 import を避けるため、子フィールドのレンダリング
 * は renderField prop で受け取る。
 */

import { useState, type ReactNode } from "react";
import type { z } from "zod";
import type { FieldMetadata } from "@conform-to/react";
import { cn } from "@/shared/lib/cn";
import { isRecord } from "@/shared/lib/serialize";
import { Card, CardContent } from "@/admin/components/ui";
import { IconChevronDown } from "@tabler/icons-react";
import { getZodObjectShape, extractFieldMetaDeep } from "../zod-introspection";
import type { FieldInfo } from "../zod-introspection";

export function AutoGroupField({
  field,
  label,
  schema,
  defaultValue,
  renderField,
}: {
  readonly field: FieldMetadata<unknown>;
  readonly label: string;
  readonly schema: z.ZodType;
  readonly defaultValue: unknown;
  readonly renderField: (
    info: FieldInfo,
    subField: FieldMetadata<unknown>,
    defaultValue: unknown,
  ) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const shape = getZodObjectShape(schema);
  if (!shape) return null;

  const groupDefaultValue = isRecord(defaultValue) ? defaultValue : {};

  const subFields: FieldInfo[] = [];
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const meta = extractFieldMetaDeep(fieldSchema);
    if (meta) {
      subFields.push({ key, schema: fieldSchema, meta });
    }
  }

  if (subFields.length === 0) return null;

  // conform: nested object のサブフィールドアクセサ（Record<string, FieldMetadata>）
  // 動的 schema 用の境界変換（getFieldset は FieldMetadata<Record<string, T>> 必須）
  const fieldset = (
    field as unknown as FieldMetadata<Record<string, unknown>>
  ).getFieldset();

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {label}
        <IconChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen && (
        <CardContent className="pt-0 space-y-4">
          {subFields.map((subField) => {
            const subFieldMeta = fieldset[subField.key];
            if (!subFieldMeta) return null;
            return renderField(
              subField,
              subFieldMeta,
              groupDefaultValue[subField.key],
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
