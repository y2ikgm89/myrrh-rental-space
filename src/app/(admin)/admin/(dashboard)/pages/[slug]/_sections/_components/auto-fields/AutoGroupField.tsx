"use client";

/**
 * AutoGroupField — 折りたたみ可能なグループフィールド
 *
 * 循環 import を避けるため、子フィールドのレンダリングは renderField prop で受け取る。
 */

import { useState } from "react";
import { z } from "zod";
import { cn } from "@/shared/lib/cn";
import { Card, CardContent } from "@/admin/components/ui";
import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { getZodObjectShape, extractFieldMetaDeep } from "../zod-introspection";
import type { FieldInfo } from "../zod-introspection";

export function AutoGroupField({
  fieldKey,
  label,
  schema,
  defaultValue,
  renderField,
}: {
  readonly fieldKey: string;
  readonly label: string;
  readonly schema: z.ZodType;
  readonly defaultValue: unknown;
  readonly renderField: (
    info: FieldInfo,
    namePrefix: string,
    defaultValue: unknown,
  ) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const shape = getZodObjectShape(schema);
  if (!shape) return null;

  const groupDefaultValue =
    typeof defaultValue === "object" && defaultValue !== null
      ? (defaultValue as Record<string, unknown>)
      : {};

  const subFields: FieldInfo[] = [];
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const meta = extractFieldMetaDeep(fieldSchema);
    if (meta) {
      subFields.push({ key, schema: fieldSchema, meta });
    }
  }

  if (subFields.length === 0) return null;

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
          {subFields.map((subField) =>
            renderField(subField, fieldKey, groupDefaultValue[subField.key]),
          )}
        </CardContent>
      )}
    </Card>
  );
}
