"use client";

import type { ReactElement, ReactNode } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { FieldValues, Resolver } from "react-hook-form";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { z } from "zod";
import { extractFieldDefinitions } from "@/shared/lib/sections/schema-utils";
import { FieldRenderer } from "./FieldRenderer";
import { ConditionalWrapper } from "./ConditionalWrapper";

interface SchemaFormProps {
  readonly schema: z.ZodType;
  readonly defaultValues: Record<string, unknown>;
  readonly onSubmit: (data: Record<string, unknown>) => void;
  readonly isPending?: boolean;
  readonly children?: ReactNode;
}

/**
 * Zod スキーマを standardSchemaResolver に渡すためのアダプター。
 * `z.ZodType<unknown>` は `StandardSchemaV1<FieldValues>` に型引数が合わないため、
 * 共変な型の境界で `unknown as` による二段階キャストが必要（type-safety.md §4 参照）。
 */
function toResolver(schema: z.ZodType): Resolver<FieldValues> {
  // z.ZodType<unknown> → StandardSchemaV1<FieldValues> の境界変換。
  // FieldValues = Record<string, any> であり実行時の構造は変わらない。
  const fieldValuesSchema = schema as unknown as StandardSchemaV1<FieldValues>;
  return standardSchemaResolver(fieldValuesSchema);
}

export function SchemaForm({
  schema,
  defaultValues,
  onSubmit,
  isPending = false,
  children,
}: SchemaFormProps): ReactElement {
  const fields = extractFieldDefinitions(schema);
  const form = useForm<FieldValues>({
    resolver: toResolver(schema),
    defaultValues,
  });

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <ConditionalWrapper key={field.name} field={field} control={form.control}>
          <FieldRenderer
            field={field}
            control={form.control}
            register={form.register}
            errors={form.formState.errors}
            isPending={isPending}
            setValue={form.setValue}
          />
        </ConditionalWrapper>
      ))}
      {children}
    </form>
  );
}
