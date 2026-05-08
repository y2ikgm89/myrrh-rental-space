"use client";

/**
 * AutoSectionForm — Zod スキーマ駆動のセクション設定フォーム自動生成
 *
 * セクション定義レジストリから Zod スキーマを取得し、各フィールドに埋め込まれた
 * FieldMeta メタデータを読み取って対応する UI コンポーネントを自動レンダリングする。
 *
 * 「custom」セクションタイプのみ Lexical エディタを先頭に表示する。
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import dynamic from "next/dynamic";
import { z } from "zod";
import {
  IconArticle,
  IconLink,
  IconPhoto,
  IconTypography,
} from "@tabler/icons-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Input,
  Label,
  Textarea,
} from "@/admin/components/ui";
import { fieldRegistry } from "@/shared/lib/sections/field-registry";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";
import { PortableTextInlineEditor } from "@/admin/components/portable-text/inline-editor/PortableTextInlineEditor";
import { createSpanArraySchema } from "@/shared/lib/portable-text";
import { FormActions, type ConfigFormProps } from "./config-forms/shared";
import { FieldGroupSection } from "./FieldGroupSection";
import {
  extractDiscriminatedUnionInfo,
  extractSchemaFields,
} from "./zod-introspection";
import type { FieldInfo } from "./zod-introspection";
import type { FieldType } from "@/shared/lib/sections/types";
import type {
  DynamicCategoryOption,
  DynamicSectionOptions,
} from "@/shared/domain/sections/dynamic-options";
import { AutoBooleanField } from "./auto-fields/AutoBooleanField";
import { AutoSelectField } from "./auto-fields/AutoSelectField";
import { AutoArrayField } from "./auto-fields/AutoArrayField";
import { AutoGroupField } from "./auto-fields/AutoGroupField";
import { AutoImageField } from "./auto-fields/AutoImageField";
import { isRecord } from "@/shared/lib/serialize";

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
  contentOnly = false,
  dynamicOptions,
}: ConfigFormProps) {
  const definition = getSectionDefinition(section.type);
  const isCustomType = section.type === "custom";
  const initialEditorContentJson = section.contentJson
    ? JSON.stringify(section.contentJson)
    : EMPTY_LEXICAL_EDITOR_STATE_JSON;
  const [editorContentJson, setEditorContentJson] = useState(
    initialEditorContentJson,
  );

  // デフォルト config を取得（スキーマ .parse({}) でデフォルト値を生成）
  const defaultConfig = definition
    ? (() => {
        const result = definition.configSchema.safeParse(section.config);
        if (result.success && isRecord(result.data)) {
          return result.data;
        }
        // config のパースに失敗した場合、空オブジェクトでデフォルト生成
        const fallback = definition.configSchema.safeParse({});
        if (fallback.success && isRecord(fallback.data)) {
          return fallback.data;
        }
        return {};
      })()
    : {};

  const schema = definition?.configSchema;

  // Discriminated union 判定（page-hero 等）— variant 切替時の form.reset 制御に使用
  const duInfo = schema ? extractDiscriminatedUnionInfo(schema) : undefined;

  // standardSchemaResolver は StandardSchemaV1<FieldValues> を要求するが、
  // z.ZodType<unknown> は input 型が unknown のため直接互換しない。
  // configSchema は常に z.object({...}) または z.discriminatedUnion(...) で
  // 定義されるため FieldValues と互換。
  // type-safety.md §許可例外 7 で文書化された境界変換パターン。
  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
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

  // Discriminator field の current value を監視
  // discriminator が無い schema では useWatch は no-op（undefined を返す）
  const watchedDiscriminator = useWatch({
    control,
    name: duInfo?.discriminator ?? "__no_discriminator__",
  });

  // 直前に reset / 初期化した variant 値を ref で記憶し、無限ループを防ぐ
  // 初期値は section.config 由来の variant（defaultConfig.variant）
  const lastVariantRef = useRef<string | undefined>(
    isRecord(defaultConfig) && typeof defaultConfig["variant"] === "string"
      ? defaultConfig["variant"]
      : undefined,
  );

  // Variant 切替時に form.reset で新 variant の default 値を流し込む（RHF 公式パターン）
  // useEffectEvent で schema / duInfo / reset を deps から外し、watchedDiscriminator の
  // 純粋な変化のみで trigger する（react-hooks/exhaustive-deps 準拠）
  const applyVariantReset = useEffectEvent((nextVariant: string) => {
    if (!duInfo || !schema) return;
    const validValues = new Set(duInfo.options.map((o) => o.value));
    if (!validValues.has(nextVariant)) return;
    if (lastVariantRef.current === nextVariant) return;
    const fallback = schema.safeParse({
      [duInfo.discriminator]: nextVariant,
    });
    if (fallback.success && isRecord(fallback.data)) {
      lastVariantRef.current = nextVariant;
      reset(fallback.data);
    }
  });

  useEffect(() => {
    if (typeof watchedDiscriminator !== "string") return;
    applyVariantReset(watchedDiscriminator);
  }, [watchedDiscriminator]);

  const watchedValues: Record<string, unknown> | undefined = duInfo
    ? { [duInfo.discriminator]: watchedDiscriminator }
    : undefined;
  const fields = schema ? extractSchemaFields(schema, watchedValues) : [];
  const isEditorDirty =
    isCustomType && editorContentJson !== initialEditorContentJson;
  const isFormDirty = isDirty || isEditorDirty;

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

  // Group 別にフィールドを分離（ADR 0018: content / design / advanced の 3 段階固定）
  const contentFields = fields.filter((f) => f.meta.group === "content");
  const designFields = contentOnly
    ? []
    : fields.filter((f) => f.meta.group === "design");
  const advancedFields = contentOnly
    ? []
    : fields.filter((f) => f.meta.group === "advanced");
  const hasAccordionContent =
    designFields.length > 0 || advancedFields.length > 0;

  const renderField = (fieldInfo: (typeof fields)[number]) => (
    <AutoField
      key={fieldInfo.key}
      fieldInfo={fieldInfo}
      register={register}
      setValue={setValue}
      control={control}
      isPending={isPending}
      defaultValue={defaultConfig[fieldInfo.key]}
      errors={errors}
      dynamicOptions={dynamicOptions}
    />
  );

  // subGroup 別に content フィールドを分類（design / advanced は Accordion 内のため未分類）
  const textFields = contentFields.filter((f) => f.meta.subGroup === "text");
  const imageFields = contentFields.filter((f) => f.meta.subGroup === "image");
  const buttonFields = contentFields.filter(
    (f) => f.meta.subGroup === "button",
  );
  const otherFields = contentFields.filter(
    (f) => f.meta.subGroup === undefined || f.meta.subGroup === "other",
  );

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Content: 常時展開（Accordion 外） */}
      <div className="space-y-6">
        {/* Custom セクションのみ: Lexical エディタを表示 */}
        {isCustomType && (
          <FieldGroupSection title="本文" icon={IconArticle}>
            <LexicalEditor
              contentJson={editorContentJson}
              onChange={setEditorContentJson}
              placeholder="セクションのコンテンツを入力..."
              className={EDITOR_PROSE_CLASSES}
              height="400px"
            />
          </FieldGroupSection>
        )}

        {textFields.length > 0 && (
          <FieldGroupSection title="テキスト" icon={IconTypography}>
            {textFields.map(renderField)}
          </FieldGroupSection>
        )}

        {imageFields.length > 0 && (
          <FieldGroupSection title="画像" icon={IconPhoto}>
            {imageFields.map(renderField)}
          </FieldGroupSection>
        )}

        {buttonFields.length > 0 && (
          <FieldGroupSection title="ボタン・リンク" icon={IconLink}>
            {buttonFields.map(renderField)}
          </FieldGroupSection>
        )}

        {otherFields.length > 0 && (
          <div className="space-y-4">{otherFields.map(renderField)}</div>
        )}
      </div>

      {/* Design + Advanced: Radix Accordion（type="multiple"、既定閉じ） */}
      {hasAccordionContent && (
        <Accordion
          type="multiple"
          className="border-t border-border"
          defaultValue={[]}
        >
          {designFields.length > 0 && (
            <AccordionItem value="design">
              <AccordionTrigger className="px-1">デザイン</AccordionTrigger>
              <AccordionContent className="space-y-4 px-1 pt-2">
                {designFields.map(renderField)}
              </AccordionContent>
            </AccordionItem>
          )}
          {advancedFields.length > 0 && (
            <AccordionItem value="advanced">
              <AccordionTrigger className="px-1">詳細設定</AccordionTrigger>
              <AccordionContent className="space-y-4 px-1 pt-2">
                {advancedFields.map(renderField)}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}

      <FormActions
        isDirty={isFormDirty}
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
  readonly register: UseFormRegister<FieldValues>;
  readonly setValue: UseFormSetValue<FieldValues>;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  readonly errors: FieldErrors<FieldValues>;
  readonly dynamicOptions: DynamicSectionOptions | undefined;
}

function AutoField({
  fieldInfo,
  register,
  setValue,
  control,
  isPending,
  defaultValue,
  errors,
  dynamicOptions,
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
      leadingIcon={meta.leadingIcon}
      trailingIcon={meta.trailingIcon}
      schema={fieldInfo.schema}
      register={register}
      setValue={setValue}
      control={control}
      isPending={isPending}
      defaultValue={defaultValue}
      error={typeof errorMessage === "string" ? errorMessage : undefined}
      errors={errors}
      dynamicOptions={dynamicOptions}
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
  readonly leadingIcon: string | undefined;
  readonly trailingIcon: string | undefined;
  readonly schema: z.ZodType;
  readonly register: UseFormRegister<FieldValues>;
  readonly setValue: UseFormSetValue<FieldValues>;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  readonly error: string | undefined;
  readonly errors: FieldErrors<FieldValues>;
  readonly dynamicOptions: DynamicSectionOptions | undefined;
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
    leadingIcon,
    trailingIcon,
    schema,
    register,
    setValue,
    control,
    isPending,
    defaultValue,
    error,
    errors,
    dynamicOptions,
  } = props;

  switch (fieldType) {
    case "text":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            {...register(fieldKey)}
            placeholder={placeholder}
            disabled={isPending}
            {...(leadingIcon !== undefined && { leadingIcon })}
            {...(trailingIcon !== undefined && { trailingIcon })}
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

    case "icon":
      return (
        <AutoIconField
          fieldId={fieldId}
          fieldKey={fieldKey}
          label={label}
          helpText={helpText}
          control={control}
          isPending={isPending}
          error={error}
        />
      );

    case "portable-text-inline":
      return (
        <AutoRichLabelField
          fieldId={fieldId}
          fieldKey={fieldKey}
          label={label}
          helpText={helpText}
          control={control}
          isPending={isPending}
          error={error}
        />
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
              {...(leadingIcon !== undefined && { leadingIcon })}
              {...(trailingIcon !== undefined && { trailingIcon })}
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

    case "select": {
      const meta = fieldRegistry.get(schema);
      const dynamicSource = meta?.dynamicSelectSource;
      const dynamicCategoryOptions:
        | ReadonlyArray<DynamicCategoryOption>
        | undefined =
        dynamicSource && dynamicOptions
          ? dynamicOptions[dynamicSource]
          : undefined;
      return (
        <AutoSelectField
          fieldKey={fieldKey}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          schema={schema}
          control={control}
          isPending={isPending}
          error={error}
          {...(dynamicCategoryOptions !== undefined && {
            dynamicOptions: dynamicCategoryOptions,
          })}
        />
      );
    }

    case "color":
      return (
        <AutoColorFieldControlled
          fieldKey={fieldKey}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          control={control}
          isPending={isPending}
          error={error}
        />
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
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            type="url"
            {...register(fieldKey)}
            placeholder={placeholder ?? "https://..."}
            disabled={isPending}
            {...(leadingIcon !== undefined && { leadingIcon })}
            {...(trailingIcon !== undefined && { trailingIcon })}
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
        <div className="space-y-2">
          <AutoArrayField
            fieldKey={fieldKey}
            label={label}
            helpText={helpText}
            schema={schema}
            control={control}
            register={register}
            isPending={isPending}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
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
            // Resolve nested error: errors.groupKey.subFieldKey.message
            // isRecord でランタイム型ガード（as 不使用）
            const groupErrors: unknown = errors[fieldKey];
            let nestedError: string | undefined;
            if (isRecord(groupErrors)) {
              const subError: unknown = groupErrors[subField.key];
              if (isRecord(subError)) {
                const msg: unknown = subError["message"];
                nestedError = typeof msg === "string" ? msg : undefined;
              }
            }
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
                leadingIcon={subField.meta.leadingIcon}
                trailingIcon={subField.meta.trailingIcon}
                schema={subField.schema}
                register={register}
                setValue={setValue}
                control={control}
                isPending={isPending}
                defaultValue={subDefaultValue}
                error={
                  typeof nestedError === "string" ? nestedError : undefined
                }
                errors={errors}
                dynamicOptions={dynamicOptions}
              />
            );
          }}
        />
      );

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
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const { field } = useController({ control, name: fieldKey });

  return (
    <div className="space-y-2">
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

// ─────────────────────────────────────────────────────────────
// Color Field (useController)
// ─────────────────────────────────────────────────────────────

function AutoColorFieldControlled({
  fieldKey,
  fieldId,
  label,
  placeholder,
  helpText,
  control,
  isPending,
  error,
}: {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const { field: colorField } = useController({ control, name: fieldKey });
  const colorValue =
    typeof colorField.value === "string" ? colorField.value : "#000000";

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={`${fieldId}-picker`}
          className="h-9 w-12 cursor-pointer rounded border p-1"
          value={colorValue}
          onChange={(e) => colorField.onChange(e.target.value)}
          disabled={isPending}
        />
        <Input
          id={fieldId}
          value={colorValue}
          onChange={(e) => colorField.onChange(e.target.value)}
          onBlur={colorField.onBlur}
          placeholder={placeholder ?? "#000000"}
          disabled={isPending}
          className="flex-1"
        />
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function AutoIconField({
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
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const { field } = useController({ control, name: fieldKey });
  const value = typeof field.value === "string" ? field.value : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <IconPickerField
        id={fieldId}
        value={value}
        onChange={(name) => field.onChange(name)}
        disabled={isPending}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function AutoRichLabelField({
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
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const { field } = useController({ control, name: fieldKey });
  const parsed = createSpanArraySchema().safeParse(field.value);
  const value = parsed.success ? parsed.data : [];

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <PortableTextInlineEditor
        id={fieldId}
        value={value}
        onChange={(tokens) => field.onChange(tokens)}
        disabled={isPending}
        aria-label={label}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
