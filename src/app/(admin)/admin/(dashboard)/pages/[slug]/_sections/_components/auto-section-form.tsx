"use client";

/**
 * AutoSectionForm — Zod スキーマ駆動のセクション設定フォーム自動生成
 *
 * セクション定義レジストリから Zod スキーマを取得し、各フィールドに埋め込まれた
 * FieldMeta メタデータを読み取って対応する UI コンポーネントを自動レンダリングする。
 *
 * 「custom」セクションタイプのみ Lexical エディタを先頭に表示する。
 */

import { useState, useId } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import dynamic from "next/dynamic";
import { z } from "zod";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { IconChevronDown, IconPlus, IconTrash } from "@tabler/icons-react";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import { extractFieldMeta } from "@/shared/lib/sections/field-helpers";
import type { FieldMeta, FieldType } from "@/shared/lib/sections/types";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { FormActions, type ConfigFormProps } from "./config-forms/shared";

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
// Types
// ─────────────────────────────────────────────────────────────

interface FieldInfo {
  readonly key: string;
  readonly schema: z.ZodType;
  readonly meta: FieldMeta;
}

interface ArrayItemFieldInfo {
  readonly key: string;
  readonly schema: z.ZodType;
  readonly meta: FieldMeta | undefined;
}

// ─────────────────────────────────────────────────────────────
// Zod 4 Introspection Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Zod スキーマから ZodObject の shape を取得する。
 * ZodDefault, ZodPipe 等のラッパーを再帰的にアンラップする。
 *
 * Zod 4 の内部構造（_zod.def）にアクセスするため unknown 経由で安全に型変換する。
 * これらの introspection ヘルパーは Zod 内部 API への境界アダプターであり、
 * `as` の使用は type-safety.md §keysOf/entriesOf と同じ「境界ヘルパー」パターン。
 */
function getZodObjectShape(
  schema: z.ZodType,
): Record<string, z.ZodType> | undefined {
  // Direct object — has .shape
  if (hasShape(schema)) {
    return schema.shape;
  }

  const def = getZodDef(schema);
  if (!def) return undefined;

  const type = def["type"];

  // ZodDefault → innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return getZodObjectShape(def["innerType"]);
  }

  // ZodPipe → in
  if (type === "pipe" && isZodType(def["in"])) {
    return getZodObjectShape(def["in"]);
  }

  // ZodOptional → innerType
  if (type === "optional" && isZodType(def["innerType"])) {
    return getZodObjectShape(def["innerType"]);
  }

  return undefined;
}

/**
 * unknown 値が z.ZodType っぽいかどうかを判定する。
 * _zod プロパティと description プロパティの存在で判定する。
 */
function isZodType(value: unknown): value is z.ZodType {
  if (typeof value !== "object" || value === null) return false;
  // Zod 4 のスキーマは _zod プロパティを持つ
  return "_zod" in value;
}

/**
 * Zod スキーマの _zod.def を安全に取得する。
 */
function getZodDef(schema: z.ZodType): Record<string, unknown> | undefined {
  const raw: unknown = schema;
  if (typeof raw !== "object" || raw === null) return undefined;
  const zod = (raw as Record<string, unknown>)["_zod"];
  if (typeof zod !== "object" || zod === null) return undefined;
  const def = (zod as Record<string, unknown>)["def"];
  if (typeof def !== "object" || def === null) return undefined;
  return def as Record<string, unknown>;
}

/**
 * ZodObject の shape プロパティがあるか型安全にチェック。
 */
function hasShape(
  schema: z.ZodType,
): schema is z.ZodType & { shape: Record<string, z.ZodType> } {
  const raw: unknown = schema;
  if (typeof raw !== "object" || raw === null) return false;
  const shape = (raw as Record<string, unknown>)["shape"];
  return typeof shape === "object" && shape !== null;
}

/**
 * FieldMeta を抽出する。
 * ZodPipe の場合は in 側（describe が付いている側）を探索する。
 */
function extractFieldMetaDeep(schema: z.ZodType): FieldMeta | undefined {
  // Direct description
  const meta = extractFieldMeta(schema);
  if (meta) return meta;

  const def = getZodDef(schema);
  if (!def) return undefined;

  const type = def["type"];

  // ZodPipe → check in side
  if (type === "pipe" && isZodType(def["in"])) {
    return extractFieldMetaDeep(def["in"]);
  }

  // ZodDefault → check innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return extractFieldMetaDeep(def["innerType"]);
  }

  // ZodOptional → check innerType
  if (type === "optional" && isZodType(def["innerType"])) {
    return extractFieldMetaDeep(def["innerType"]);
  }

  return undefined;
}

/**
 * ZodDefault/ZodPipe をアンラップして select フィールドの enum 値を取得する。
 */
function getSelectOptions(schema: z.ZodType): string[] {
  const def = getZodDef(schema);
  if (!def) return [];

  const type = def["type"];

  // ZodEnum → entries
  if (type === "enum") {
    const entries = def["entries"];
    if (typeof entries === "object" && entries !== null) {
      return Object.keys(entries);
    }
    return [];
  }

  // ZodDefault → innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return getSelectOptions(def["innerType"]);
  }

  // ZodPipe → in
  if (type === "pipe" && isZodType(def["in"])) {
    return getSelectOptions(def["in"]);
  }

  // ZodOptional → innerType
  if (type === "optional" && isZodType(def["innerType"])) {
    return getSelectOptions(def["innerType"]);
  }

  return [];
}

/**
 * ZodDefault/ZodArray から配列要素の ZodObject shape を取得する。
 */
function getArrayItemShape(
  schema: z.ZodType,
): Record<string, z.ZodType> | undefined {
  const def = getZodDef(schema);
  if (!def) return undefined;

  const type = def["type"];

  // ZodArray → element
  if (type === "array") {
    const element = def["element"];
    if (isZodType(element) && hasShape(element)) {
      return element.shape;
    }
    return undefined;
  }

  // ZodDefault → innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return getArrayItemShape(def["innerType"]);
  }

  return undefined;
}

/**
 * ZodObject の shape からフィールド情報を抽出する。
 * FieldMeta のないフィールドはスキップする。
 */
function extractSchemaFields(schema: z.ZodType): FieldInfo[] {
  const shape = getZodObjectShape(schema);
  if (!shape) return [];

  const fields: FieldInfo[] = [];
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const meta = extractFieldMetaDeep(fieldSchema);
    if (meta) {
      fields.push({ key, schema: fieldSchema, meta });
    }
  }
  return fields;
}

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
    formState: { isDirty },
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
}

function AutoField({
  fieldInfo,
  register,
  setValue,
  control,
  isPending,
  defaultValue,
}: AutoFieldProps) {
  const { key, meta } = fieldInfo;
  const fieldId = `auto-${key}`;

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
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={fieldId}
            checked={typeof defaultValue === "boolean" ? defaultValue : false}
            onCheckedChange={(checked) => setValue(fieldKey, checked)}
            disabled={isPending}
          />
          <Label htmlFor={fieldId}>{label}</Label>
          {helpText && (
            <p className="text-xs text-muted-foreground ml-2">{helpText}</p>
          )}
        </div>
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
        </div>
      );

    case "image":
    case "url":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            type={fieldType === "url" ? "url" : "text"}
            {...register(fieldKey)}
            placeholder={
              placeholder ??
              (fieldType === "url" ? "https://..." : "画像URLを入力")
            }
            disabled={isPending}
          />
          {helpText && (
            <p className="text-xs text-muted-foreground">{helpText}</p>
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
          register={register}
          setValue={setValue}
          control={control}
          isPending={isPending}
          defaultValue={defaultValue}
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
// Select Field
// ─────────────────────────────────────────────────────────────

function AutoSelectField({
  fieldKey,
  fieldId,
  label,
  placeholder,
  helpText,
  schema,
  setValue,
  isPending,
  defaultValue,
}: {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly schema: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly setValue: ReturnType<typeof useForm<any>>["setValue"];
  readonly isPending: boolean;
  readonly defaultValue: unknown;
}) {
  const options = getSelectOptions(schema);

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        {...(typeof defaultValue === "string" && {
          defaultValue,
        })}
        onValueChange={(v) => setValue(fieldKey, v)}
        disabled={isPending}
      >
        <SelectTrigger id={fieldId}>
          <SelectValue placeholder={placeholder ?? "選択してください"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Array Field
// ─────────────────────────────────────────────────────────────

function AutoArrayField({
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

// ─────────────────────────────────────────────────────────────
// Group Field
// ─────────────────────────────────────────────────────────────

function AutoGroupField({
  fieldKey,
  label,
  schema,
  register,
  setValue,
  control,
  isPending,
  defaultValue,
}: {
  readonly fieldKey: string;
  readonly label: string;
  readonly schema: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly register: ReturnType<typeof useForm<any>>["register"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly setValue: ReturnType<typeof useForm<any>>["setValue"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly control: ReturnType<typeof useForm<any>>["control"];
  readonly isPending: boolean;
  readonly defaultValue: unknown;
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
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <CardContent className="pt-0 space-y-4">
          {subFields.map((subField) => {
            const nestedKey = `${fieldKey}.${subField.key}`;
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
                defaultValue={groupDefaultValue[subField.key]}
              />
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
