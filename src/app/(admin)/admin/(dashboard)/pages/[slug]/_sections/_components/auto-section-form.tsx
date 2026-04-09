"use client";

/**
 * AutoSectionForm — Zod スキーマ駆動のセクション設定フォーム自動生成
 *
 * セクション定義レジストリから Zod スキーマを取得し、各フィールドに埋め込まれた
 * FieldMeta メタデータを読み取って対応する UI コンポーネントを自動レンダリングする。
 *
 * 「custom」セクションタイプのみ Lexical エディタを先頭に表示する。
 */

import { useState } from "react";
import { useController, useForm, type Control } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import dynamic from "next/dynamic";
import { z } from "zod";
import { Input, Label, Textarea } from "@/admin/components/ui";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { FormActions, type ConfigFormProps } from "./config-forms/shared";
import { extractSchemaFields } from "./zod-introspection";
import type { FieldInfo } from "./zod-introspection";
import type { FieldType } from "@/shared/lib/sections/types";
import { AutoBooleanField } from "./auto-fields/AutoBooleanField";
import { AutoSelectField } from "./auto-fields/AutoSelectField";
import { AutoArrayField } from "./auto-fields/AutoArrayField";
import { AutoGroupField } from "./auto-fields/AutoGroupField";
import { AutoImageField } from "./auto-fields/AutoImageField";

const LexicalEditor = dynamic(
  () =>
    import("@/admin/components/editor/lexical/LexicalEditor").then((mod) => ({
      default: mod.LexicalEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">
          エディタを読み込み中...
        </div>
      </div>
    ),
  },
);

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export function AutoSectionForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const definition = getSectionDefinition(section.type);
  const isCustomType = section.type === "custom";
  const [editorContentJson, setEditorContentJson] = useState("");

  // デフォルト config を取得（スキーマ .parse({}) でデフォルト値を生成）
  const defaultConfig = definition
    ? (() => {
        const result = definition.configSchema.safeParse(section.config);
        if (
          result.success &&
          typeof result.data === "object" &&
          result.data !== null
        ) {
          return result.data as Record<string, unknown>;
        }
        // config のパースに失敗した場合、空オブジェクトでデフォルト生成
        const fallback = definition.configSchema.safeParse({});
        if (
          fallback.success &&
          typeof fallback.data === "object" &&
          fallback.data !== null
        ) {
          return fallback.data as Record<string, unknown>;
        }
        return {};
      })()
    : {};

  const schema = definition?.configSchema;
  const fields = schema ? extractSchemaFields(schema) : [];

  // standardSchemaResolver は StandardSchemaV1<FieldValues> を要求するが、
  // z.ZodType<unknown> は input 型が unknown のため直接互換しない。
  // configSchema は常に z.object({...}) で定義されるため FieldValues と互換。
  // この境界変換は type-safety.md §keysOf/entriesOf と同じ「境界ヘルパー」パターン。
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty, errors },
  } = useForm<Record<string, unknown>>({
    ...(schema
      ? {
          resolver: standardSchemaResolver(
            schema as unknown as z.ZodObject<Record<string, z.ZodType>>,
          ),
        }
      : {}),
    defaultValues: defaultConfig,
  });

  const handleFormSubmit = (data: Record<string, unknown>) => {
    if (isCustomType) {
      onSave({ config: data, contentJson: editorContentJson });
    } else {
      onSave({ config: data });
    }
  };

  if (!definition) {
    return (
      <p className="text-sm text-muted-foreground">
        このセクションタイプにはコンテンツ設定がありません
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-4">
        {/* Custom セクションのみ: Lexical エディタを表示 */}
        {isCustomType && (
          <div className="space-y-2">
            <Label>コンテンツ</Label>
            <LexicalEditor
              contentJson={
                section.contentJson
                  ? JSON.stringify(section.contentJson)
                  : EMPTY_LEXICAL_EDITOR_STATE_JSON
              }
              onChange={setEditorContentJson}
              placeholder="セクションのコンテンツを入力..."
              className={EDITOR_PROSE_CLASSES}
              height="400px"
            />
          </div>
        )}

        {/* スキーマ駆動フィールド */}
        {fields.map((fieldInfo) => (
          <AutoField
            key={fieldInfo.key}
            fieldInfo={fieldInfo}
            register={register}
            setValue={setValue}
            control={control}
            isPending={isPending}
            defaultValue={defaultConfig[fieldInfo.key]}
            errors={errors}
          />
        ))}
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Field Renderer
// ─────────────────────────────────────────────────────────────

interface AutoFieldProps {
  readonly fieldInfo: FieldInfo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RHF generic compatibility
  readonly register: ReturnType<typeof useForm<any>>["register"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly setValue: ReturnType<typeof useForm<any>>["setValue"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly control: ReturnType<typeof useForm<any>>["control"];
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RHF generic FieldErrors
  readonly errors: ReturnType<typeof useForm<any>>["formState"]["errors"];
}

function AutoField({
  fieldInfo,
  register,
  setValue,
  control,
  isPending,
  defaultValue,
  errors,
}: AutoFieldProps) {
  const { key, meta } = fieldInfo;
  const fieldId = `auto-${key}`;
  const errorMessage = errors[key]?.message;

  return (
    <AutoFieldByType
      fieldType={meta.fieldType}
      fieldKey={key}
      fieldId={fieldId}
      label={meta.label}
      placeholder={meta.placeholder}
      helpText={meta.helpText}
      suffix={meta.suffix}
      schema={fieldInfo.schema}
      register={register}
      setValue={setValue}
      control={control}
      isPending={isPending}
      defaultValue={defaultValue}
      error={typeof errorMessage === "string" ? errorMessage : undefined}
    />
  );
}

interface AutoFieldByTypeProps {
  readonly fieldType: FieldType;
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly suffix: string | undefined;
  readonly schema: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly register: ReturnType<typeof useForm<any>>["register"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly setValue: ReturnType<typeof useForm<any>>["setValue"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly control: ReturnType<typeof useForm<any>>["control"];
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  readonly error: string | undefined;
}

function AutoFieldByType(props: AutoFieldByTypeProps) {
  const {
    fieldType,
    fieldKey,
    fieldId,
    label,
    placeholder,
    helpText,
    suffix,
    schema,
    register,
    setValue,
    control,
    isPending,
    defaultValue,
    error,
  } = props;

  switch (fieldType) {
    case "text":
    case "icon":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            {...register(fieldKey)}
            placeholder={placeholder}
            disabled={isPending}
          />
          {helpText && (
            <p className="text-xs text-muted-foreground">{helpText}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      );

    case "textarea":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Textarea
            id={fieldId}
            {...register(fieldKey)}
            placeholder={placeholder}
            rows={3}
            disabled={isPending}
          />
          {helpText && (
            <p className="text-xs text-muted-foreground">{helpText}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      );

    case "number":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={fieldId}
              type="number"
              {...register(fieldKey, { valueAsNumber: true })}
              disabled={isPending}
            />
            {suffix && (
              <span className="text-sm text-muted-foreground shrink-0">
                {suffix}
              </span>
            )}
          </div>
          {helpText && (
            <p className="text-xs text-muted-foreground">{helpText}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      );

    case "boolean":
      return (
        <AutoBooleanField
          fieldKey={fieldKey}
          fieldId={fieldId}
          label={label}
          helpText={helpText}
          control={control}
          isPending={isPending}
          error={error}
        />
      );

    case "select":
      return (
        <AutoSelectField
          fieldKey={fieldKey}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          schema={schema}
          setValue={setValue}
          isPending={isPending}
          defaultValue={defaultValue}
        />
      );

    case "color":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id={`${fieldId}-picker`}
              className="h-9 w-12 cursor-pointer rounded border p-1"
              defaultValue={
                typeof defaultValue === "string" ? defaultValue : "#000000"
              }
              onChange={(e) => setValue(fieldKey, e.target.value)}
              disabled={isPending}
            />
            <Input
              id={fieldId}
              {...register(fieldKey)}
              placeholder={placeholder ?? "#000000"}
              disabled={isPending}
              className="flex-1"
            />
          </div>
          {helpText && (
            <p className="text-xs text-muted-foreground">{helpText}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      );

    case "image":
      return (
        <AutoImageFieldControlled
          fieldKey={fieldKey}
          fieldId={fieldId}
          label={label}
          helpText={helpText}
          control={control}
          isPending={isPending}
          error={error}
        />
      );

    case "url":
      return (
        <div className="space-y-1">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            type="url"
            {...register(fieldKey)}
            placeholder={placeholder ?? "https://..."}
            disabled={isPending}
          />
          {helpText && (
            <p className="text-xs text-muted-foreground">{helpText}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      );

    case "array":
      return (
        <AutoArrayField
          fieldKey={fieldKey}
          label={label}
          helpText={helpText}
          schema={schema}
          control={control}
          register={register}
          isPending={isPending}
        />
      );

    case "group":
      return (
        <AutoGroupField
          fieldKey={fieldKey}
          label={label}
          schema={schema}
          defaultValue={defaultValue}
          renderField={(subField, namePrefix, subDefaultValue) => {
            const nestedKey = `${namePrefix}.${subField.key}`;
            const nestedId = `auto-${nestedKey}`;
            return (
              <AutoFieldByType
                key={subField.key}
                fieldType={subField.meta.fieldType}
                fieldKey={nestedKey}
                fieldId={nestedId}
                label={subField.meta.label}
                placeholder={subField.meta.placeholder}
                helpText={subField.meta.helpText}
                suffix={subField.meta.suffix}
                schema={subField.schema}
                register={register}
                setValue={setValue}
                control={control}
                isPending={isPending}
                defaultValue={subDefaultValue}
                error={undefined}
              />
            );
          }}
        />
      );

    case "richtext":
      // richtext は現在 custom セクションの Lexical エディタで処理される
      return null;

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Image Field (useController)
// ─────────────────────────────────────────────────────────────

function AutoImageFieldControlled({
  fieldKey,
  fieldId,
  label,
  helpText,
  control,
  isPending,
  error,
}: {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RHF generic compatibility
  readonly control: Control<any>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const { field } = useController({ control, name: fieldKey });

  return (
    <div className="space-y-1">
      <AutoImageField
        fieldId={fieldId}
        label={label}
        value={typeof field.value === "string" ? field.value : undefined}
        onSelect={(url) => field.onChange(url)}
        {...(helpText !== undefined && { helpText })}
        {...(isPending && { disabled: true })}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
