"use client";

/**
 * AutoGroupField — 折りたたみ可能なグループフィールド
 *
 * フィールドアクセサを取得。循環 import を避けるため、子フィールドのレンダリング
 * は renderField prop で受け取る。
 */

import { useState, type ReactNode } from "react";
import type { z } from "zod";
import type { FieldMetadata } from "@conform-to/react";
import { cn } from "@/shared/lib/cn";
import { isRecord } from "@/shared/lib/serialize";
import { Card, CardContent } from "@/admin/components/ui";
import { getTypedFieldset } from "@/shared/lib/conform/control";
import { IconChevronDown } from "@tabler/icons-react";
import { getZodObjectShape, extractFieldMetaDeep } from "../zod-introspection";
import type { FieldInfo } from "../zod-introspection";

export function AutoGroupField<TForm extends Record<string, unknown>>({
  field,
  label,
  schema,
  defaultValue,
  renderField,
}: {
  readonly field: FieldMetadata<unknown, TForm>;
  readonly label: string;
  readonly schema: z.ZodType;
  readonly defaultValue: unknown;
  readonly renderField: (
    info: FieldInfo,
    subField: FieldMetadata<unknown, TForm>,
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
  const fieldset = getTypedFieldset(field);

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
      {/*
        折りたたみは**表示だけ**の操作。unmount してはいけない（監査 F-35）。

        conform は送信時の FormData から payload を組む。input が DOM から消えると
        `image.url` / `image.alt` が 1 件も入らず、schema 側の `.prefault({})` が
        `{url:"",alt:""}` を補って **parse は成功する**。つまり
        `submission.status === "success"` のまま `onSave` まで到達し、選択済みの
        画像 URL が空文字で上書き保存される。エラーも警告も出ないので、admin は
        画像が消えた理由を知る手がかりが無い。

        Tabs 側で `forceMount` を選んだのと同じ理由。
      */}
      <CardContent className="pt-0 space-y-4" hidden={!isOpen}>
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
    </Card>
  );
}
