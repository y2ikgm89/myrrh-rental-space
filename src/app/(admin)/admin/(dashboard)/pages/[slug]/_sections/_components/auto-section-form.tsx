"use client";

/**
 * AutoSectionForm — Zod スキーマ駆動のセクション設定フォーム自動生成
 *
 * onSave callback 契約は維持（親 SectionEditPanel が updatePageSection を呼ぶ pattern）。
 *
 * セクション定義レジストリから Zod スキーマを取得し、各フィールドに埋め込まれた
 * FieldMeta メタデータを読み取って対応する UI コンポーネントを自動レンダリングする。
 *
 * 「custom」セクションタイプのみ Lexical エディタを先頭に表示する。
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  type FieldMetadata,
  type FormMetadata,
} from "@conform-to/react";
import {
  asConformLooseRecord,
  useTypedInputControl,
} from "@/shared/lib/conform/typed-input-control";
import { parseWithZod } from "@conform-to/zod/v4";
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
// IconPickerField は Tabler 100+ icons + IconPickerDialog を含む heavy chain (~300+ KB)。
const IconPickerField = dynamic(
  () =>
    import("@/admin/components/icon-picker/IconPickerField").then((mod) => ({
      default: mod.IconPickerField,
    })),
  { ssr: false },
);
const PortableTextInlineEditor = dynamic(
  () =>
    import("@/admin/components/portable-text/inline-editor/PortableTextInlineEditor").then(
      (mod) => ({ default: mod.PortableTextInlineEditor }),
    ),
  { ssr: false },
);
const PortableTextBlockEditor = dynamic(
  () =>
    import("@/admin/components/portable-text/block-editor/PortableTextBlockEditor").then(
      (mod) => ({ default: mod.PortableTextBlockEditor }),
    ),
  { ssr: false },
);
import {
  createBlockArraySchema,
  createSpanArraySchema,
  type PortableTextBlock,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import { FormActions, type ConfigFormProps } from "./config-forms/shared";
import { FieldGroupSection } from "./FieldGroupSection";
import {
  extractDiscriminatedUnionInfo,
  extractSchemaFields,
} from "./zod-introspection";
import type { FieldInfo, ArrayItemFieldInfo } from "./zod-introspection";
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

  // Discriminated union 判定（page-hero 等）— variant 切替時の form 値置換に使用
  const duInfo = schema ? extractDiscriminatedUnionInfo(schema) : undefined;

  // conform useForm: callback-based form（onSave 起動）
  // 動的 schema のため defaultValue / onValidate の戻り値 / form.update に境界変換が必要
  // (型 ledger §5/§7 と同列の generic invariance 対応)
  const [form, fields] = useForm<Record<string, unknown>>({
    id: `auto-section-${section.id}`,
    // defaultValue: 内部的に boolean/number/array/object を含むが、conform は runtime で
    // FormData string にシリアライズするため実害なし
    // (ledger §5 — typed-input-control SSoT helper 経由)
    defaultValue: asConformLooseRecord(defaultConfig),
    onValidate({ formData }) {
      // schema が未定義のケースも parseWithZod 経由で Submission を返す（reply 等の API 完備のため）
      // schema は typed cast して submission.value 型を form の Schema と整合させる
      const activeSchema =
        schema ?? (z.record(z.string(), z.unknown()) as z.ZodType);
      return parseWithZod(formData, {
        schema: activeSchema as z.ZodType<Record<string, unknown>>,
      });
    },
    onSubmit(event, { submission }) {
      event.preventDefault();
      if (!submission || submission.status !== "success") return;
      const config: unknown = submission.value;
      if (!isRecord(config)) return;
      if (isCustomType) {
        onSave({ config, contentJson: editorContentJson });
      } else {
        onSave({ config });
      }
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // Discriminator field の current value を監視（conform fields.X.value は reactive）
  const discriminatorKey = duInfo?.discriminator;
  const watchedDiscriminator =
    discriminatorKey !== undefined
      ? fields[discriminatorKey]?.value
      : undefined;

  // 直前に reset / 初期化した variant 値を ref で記憶し、無限ループを防ぐ
  const lastVariantRef = useRef<string | undefined>(
    isRecord(defaultConfig) && typeof defaultConfig["variant"] === "string"
      ? defaultConfig["variant"]
      : undefined,
  );

  // Variant 切替時に form.update でフォーム値を新 variant のデフォルトに置換
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
      form.update({
        value: asConformLooseRecord(fallback.data),
      });
    }
  });

  useEffect(() => {
    if (typeof watchedDiscriminator !== "string") return;
    applyVariantReset(watchedDiscriminator);
  }, [watchedDiscriminator]);

  const watchedValues: Record<string, unknown> | undefined = duInfo
    ? { [duInfo.discriminator]: watchedDiscriminator }
    : undefined;
  const fieldsList = schema ? extractSchemaFields(schema, watchedValues) : [];
  const isEditorDirty =
    isCustomType && editorContentJson !== initialEditorContentJson;
  const isFormDirty = form.dirty || isEditorDirty;

  if (!definition) {
    return (
      <p className="text-sm text-muted-foreground">
        このセクションタイプにはコンテンツ設定がありません
      </p>
    );
  }

  // Group 別にフィールドを分離（ADR 0018: content / design / advanced の 3 段階固定）
  const contentFields = fieldsList.filter((f) => f.meta.group === "content");
  const designFields = contentOnly
    ? []
    : fieldsList.filter((f) => f.meta.group === "design");
  const advancedFields = contentOnly
    ? []
    : fieldsList.filter((f) => f.meta.group === "advanced");
  const hasAccordionContent =
    designFields.length > 0 || advancedFields.length > 0;

  const renderTopLevelField = (fieldInfo: FieldInfo) => {
    const subFieldMeta = fields[fieldInfo.key];
    if (!subFieldMeta) return null;
    return (
      <AutoField
        key={fieldInfo.key}
        fieldInfo={fieldInfo}
        field={subFieldMeta}
        form={form}
        isPending={isPending}
        defaultValue={defaultConfig[fieldInfo.key]}
        dynamicOptions={dynamicOptions}
      />
    );
  };

  // subGroup 別に content フィールドを分類
  const textFields = contentFields.filter((f) => f.meta.subGroup === "text");
  const imageFields = contentFields.filter((f) => f.meta.subGroup === "image");
  const buttonFields = contentFields.filter(
    (f) => f.meta.subGroup === "button",
  );
  const otherFields = contentFields.filter(
    (f) => f.meta.subGroup === undefined || f.meta.subGroup === "other",
  );

  return (
    <form {...getFormProps(form)} className="space-y-4">
      {/* Content: 常時展開（Accordion 外） */}
      <div className="space-y-6">
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
            {textFields.map(renderTopLevelField)}
          </FieldGroupSection>
        )}

        {imageFields.length > 0 && (
          <FieldGroupSection title="画像" icon={IconPhoto}>
            {imageFields.map(renderTopLevelField)}
          </FieldGroupSection>
        )}

        {buttonFields.length > 0 && (
          <FieldGroupSection title="ボタン・リンク" icon={IconLink}>
            {buttonFields.map(renderTopLevelField)}
          </FieldGroupSection>
        )}

        {otherFields.length > 0 && (
          <div className="space-y-4">
            {otherFields.map(renderTopLevelField)}
          </div>
        )}
      </div>

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
                {designFields.map(renderTopLevelField)}
              </AccordionContent>
            </AccordionItem>
          )}
          {advancedFields.length > 0 && (
            <AccordionItem value="advanced">
              <AccordionTrigger className="px-1">詳細設定</AccordionTrigger>
              <AccordionContent className="space-y-4 px-1 pt-2">
                {advancedFields.map(renderTopLevelField)}
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
  readonly fieldInfo: FieldInfo | ArrayItemFieldInfo;
  readonly field: FieldMetadata<unknown>;
  readonly form: FormMetadata<Record<string, unknown>>;
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  readonly dynamicOptions: DynamicSectionOptions | undefined;
}

function AutoField({
  fieldInfo,
  field,
  form,
  isPending,
  defaultValue,
  dynamicOptions,
}: AutoFieldProps) {
  if (!fieldInfo.meta) return null;
  const { key, meta } = fieldInfo;
  const fieldId = `auto-${field.name}`;
  const errorMessage = field.errors?.[0];

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
      field={field}
      form={form}
      isPending={isPending}
      defaultValue={defaultValue}
      error={errorMessage}
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
  readonly field: FieldMetadata<unknown>;
  readonly form: FormMetadata<Record<string, unknown>>;
  readonly isPending: boolean;
  readonly defaultValue: unknown;
  readonly error: string | undefined;
  readonly dynamicOptions: DynamicSectionOptions | undefined;
}

function AutoFieldByType(props: AutoFieldByTypeProps) {
  const {
    fieldType,
    fieldId,
    label,
    placeholder,
    helpText,
    suffix,
    leadingIcon,
    trailingIcon,
    schema,
    field,
    form,
    isPending,
    defaultValue,
    error,
    dynamicOptions,
  } = props;

  switch (fieldType) {
    case "text":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            {...getInputProps(field, { type: "text" })}
            id={fieldId}
            placeholder={placeholder}
            disabled={isPending}
            {...(leadingIcon !== undefined && { leadingIcon })}
            {...(trailingIcon !== undefined && { trailingIcon })}
            // conform getInputProps が defaultValue / key を渡すため value 制御不要
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
          field={field}
          label={label}
          helpText={helpText}
          isPending={isPending}
          error={error}
        />
      );

    case "portable-text-inline":
      return (
        <AutoRichLabelField
          fieldId={fieldId}
          field={field}
          label={label}
          helpText={helpText}
          isPending={isPending}
          error={error}
        />
      );

    case "portable-text-block":
      return (
        <AutoRichBlocksField
          fieldId={fieldId}
          field={field}
          label={label}
          helpText={helpText}
          isPending={isPending}
          error={error}
        />
      );

    case "textarea":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Textarea
            {...getTextareaProps(field)}
            id={fieldId}
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
              {...getInputProps(field, { type: "number" })}
              id={fieldId}
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
          field={field}
          fieldId={fieldId}
          label={label}
          helpText={helpText}
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
          field={field}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          schema={schema}
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
        <AutoColorField
          field={field}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          isPending={isPending}
          error={error}
        />
      );

    case "image":
      return (
        <AutoImageFieldControlled
          field={field}
          fieldId={fieldId}
          label={label}
          helpText={helpText}
          isPending={isPending}
          error={error}
        />
      );

    case "url":
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            {...getInputProps(field, { type: "url" })}
            id={fieldId}
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
            field={field}
            form={form}
            label={label}
            helpText={helpText}
            schema={schema}
            isPending={isPending}
            renderField={(itemInfo, subField, subDefault) => (
              <AutoField
                fieldInfo={itemInfo}
                field={subField}
                form={form}
                isPending={isPending}
                defaultValue={subDefault}
                dynamicOptions={dynamicOptions}
              />
            )}
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
          field={field}
          label={label}
          schema={schema}
          defaultValue={defaultValue}
          renderField={(subInfo, subField, subDefault) => (
            <AutoField
              key={subInfo.key}
              fieldInfo={subInfo}
              field={subField}
              form={form}
              isPending={isPending}
              defaultValue={subDefault}
              dynamicOptions={dynamicOptions}
            />
          )}
        />
      );

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Specialized field components (useTypedInputControl ベース)
// ─────────────────────────────────────────────────────────────

function AutoImageFieldControlled({
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: {
  readonly field: FieldMetadata<unknown>;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const control = useTypedInputControl(field);
  const currentValue = typeof control.value === "string" ? control.value : "";

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={currentValue} />
      <AutoImageField
        fieldId={fieldId}
        label={label}
        value={currentValue.length > 0 ? currentValue : undefined}
        onSelect={(url) => control.change(url)}
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

function AutoColorField({
  field,
  fieldId,
  label,
  placeholder,
  helpText,
  isPending,
  error,
}: {
  readonly field: FieldMetadata<unknown>;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const control = useTypedInputControl(field);
  const colorValue =
    typeof control.value === "string" && control.value.length > 0
      ? control.value
      : "";
  const swatchValue = colorValue || "#000000";

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={colorValue} />
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={`${fieldId}-picker`}
          className="h-9 w-12 cursor-pointer rounded border p-1"
          value={swatchValue}
          onChange={(e) => control.change(e.target.value)}
          disabled={isPending}
          aria-label={`${label} カラーピッカー`}
        />
        <Input
          id={fieldId}
          value={colorValue}
          onChange={(e) => control.change(e.target.value)}
          onBlur={control.blur}
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
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: {
  readonly field: FieldMetadata<unknown>;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const control = useTypedInputControl(field);
  const value = typeof control.value === "string" ? control.value : "";

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={value} />
      <Label htmlFor={fieldId}>{label}</Label>
      <IconPickerField
        id={fieldId}
        value={value}
        onChange={(name) => control.change(name)}
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
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: {
  readonly field: FieldMetadata<unknown>;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const control = useTypedInputControl(field);
  // conform stores spans as JSON string in FormData transit; parse for editor
  const rawValue = control.value;
  const parsedSpans = parsePortableTextSpans(rawValue);
  const serializedValue = JSON.stringify(parsedSpans);

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={serializedValue} />
      <Label htmlFor={fieldId}>{label}</Label>
      <PortableTextInlineEditor
        id={fieldId}
        value={parsedSpans}
        onChange={(tokens) => control.change(JSON.stringify(tokens))}
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

function AutoRichBlocksField({
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: {
  readonly field: FieldMetadata<unknown>;
  readonly fieldId: string;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly isPending: boolean;
  readonly error: string | undefined;
}) {
  const control = useTypedInputControl(field);
  const rawValue = control.value;
  const parsedBlocks = parsePortableTextBlocks(rawValue);
  const serializedValue = JSON.stringify(parsedBlocks);

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={serializedValue} />
      <Label htmlFor={fieldId}>{label}</Label>
      <PortableTextBlockEditor
        id={fieldId}
        value={parsedBlocks}
        onChange={(blocks) => control.change(JSON.stringify(blocks))}
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

// ─────────────────────────────────────────────────────────────
// Portable Text JSON transit helpers
// ─────────────────────────────────────────────────────────────

function parsePortableTextSpans(value: unknown): PortableTextSpan[] {
  if (Array.isArray(value)) {
    const result = createSpanArraySchema().safeParse(value);
    return result.success ? result.data : [];
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      const result = createSpanArraySchema().safeParse(parsed);
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parsePortableTextBlocks(value: unknown): PortableTextBlock[] {
  if (Array.isArray(value)) {
    const result = createBlockArraySchema().safeParse(value);
    return result.success ? result.data : [];
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      const result = createBlockArraySchema().safeParse(parsed);
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }
  return [];
}
