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

import { useEffect, useEffectEvent, useRef } from "react";
import { getFormProps, parse, useForm } from "@conform-to/react";
import { z } from "zod";
import { IconLink, IconPhotoVideo, IconTypography } from "@tabler/icons-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { fieldRegistry } from "@/shared/lib/sections/field-registry";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import type { DynamicCategoryOption } from "@/shared/domain/sections/dynamic-options";
import { isRecord } from "@/shared/lib/serialize";

import { AutoBooleanField } from "./auto-fields/AutoBooleanField";
import { AutoSelectField } from "./auto-fields/AutoSelectField";
import { AutoArrayField } from "./auto-fields/AutoArrayField";
import { AutoGroupField } from "./auto-fields/AutoGroupField";
import { FormActions, type ConfigFormProps } from "./config-forms/shared";
import { FieldGroupSection } from "./FieldGroupSection";
import {
  extractDiscriminatedUnionInfo,
  extractSchemaFields,
} from "./zod-introspection";
import type { FieldInfo } from "./zod-introspection";
import { AutoColorField } from "./auto-section-form/AutoColorField";
import { AutoIconField } from "./auto-section-form/AutoIconField";
import { AutoImageFieldControlled } from "./auto-section-form/AutoImageFieldControlled";
import { AutoMediaFieldControlled } from "./auto-section-form/AutoMediaFieldControlled";
import {
  AutoNumberField,
  AutoTextField,
  AutoTextareaField,
  AutoUrlField,
} from "./auto-section-form/AutoPrimitiveFields";
import { AutoRichBlocksField } from "./auto-section-form/AutoRichBlocksField";
import { AutoRichLabelField } from "./auto-section-form/AutoRichLabelField";
import {
  formatZodFieldErrors,
  toDynamicConfigForm,
} from "./auto-section-form/helpers";
import type {
  AutoFieldByTypeProps,
  AutoFieldProps,
  DynamicConfigForm,
} from "./auto-section-form/types";

export function AutoSectionForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
  dynamicOptions,
}: ConfigFormProps) {
  const definition = getSectionDefinition(section.type);

  const defaultConfig = definition
    ? (() => {
        const result = definition.configSchema.safeParse(section.config);
        if (result.success && isRecord(result.data)) {
          return result.data;
        }
        const fallback = definition.configSchema.safeParse({});
        if (fallback.success && isRecord(fallback.data)) {
          return fallback.data;
        }
        return {};
      })()
    : {};

  const schema = definition?.configSchema;
  const duInfo = schema ? extractDiscriminatedUnionInfo(schema) : undefined;

  const [form, fields] = useForm<DynamicConfigForm>({
    id: `auto-section-${section.id}`,
    defaultValue: toDynamicConfigForm(defaultConfig),
    onValidate({ formData }) {
      const activeSchema = schema ?? z.record(z.string(), z.unknown());
      return parse<DynamicConfigForm, string[]>(formData, {
        resolve(payload) {
          const result = activeSchema.safeParse(payload);
          if (!result.success) {
            return { error: formatZodFieldErrors(result.error) };
          }
          if (!isRecord(result.data)) {
            return { error: { "": ["設定値の形式が正しくありません"] } };
          }
          return { value: toDynamicConfigForm(result.data) };
        },
      });
    },
    onSubmit(event, { submission }) {
      event.preventDefault();
      if (!submission || submission.status !== "success") return;
      const config: unknown = submission.value;
      if (!isRecord(config)) return;
      onSave({ config });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const discriminatorKey = duInfo?.discriminator;
  const watchedDiscriminator =
    discriminatorKey !== undefined
      ? fields[discriminatorKey]?.value
      : undefined;

  const lastVariantRef = useRef<string | undefined>(
    discriminatorKey !== undefined &&
      isRecord(defaultConfig) &&
      typeof defaultConfig[discriminatorKey] === "string"
      ? defaultConfig[discriminatorKey]
      : undefined,
  );

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
        value: toDynamicConfigForm(fallback.data),
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
  const isFormDirty = form.dirty;

  if (!definition) {
    return (
      <p className="text-sm text-muted-foreground">
        このセクションタイプにはコンテンツ設定がありません
      </p>
    );
  }

  const contentFields = fieldsList.filter((f) => f.meta.group === "content");
  const designFields = fieldsList.filter((f) => f.meta.group === "design");
  const advancedFields = fieldsList.filter((f) => f.meta.group === "advanced");
  const hasDesignTab = designFields.length > 0 || advancedFields.length > 0;

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

  const textFields = contentFields.filter((f) => f.meta.subGroup === "text");
  const mediaFields = contentFields.filter((f) => f.meta.subGroup === "media");
  const buttonFields = contentFields.filter(
    (f) => f.meta.subGroup === "button",
  );
  const otherFields = contentFields.filter(
    (f) => f.meta.subGroup === undefined || f.meta.subGroup === "other",
  );

  const contentBlock = (
    <div className="space-y-6">
      {textFields.length > 0 && (
        <FieldGroupSection title="テキスト" icon={IconTypography}>
          {textFields.map(renderTopLevelField)}
        </FieldGroupSection>
      )}

      {mediaFields.length > 0 && (
        <FieldGroupSection title="メディア" icon={IconPhotoVideo}>
          {mediaFields.map(renderTopLevelField)}
        </FieldGroupSection>
      )}

      {buttonFields.length > 0 && (
        <FieldGroupSection title="ボタン・リンク" icon={IconLink}>
          {buttonFields.map(renderTopLevelField)}
        </FieldGroupSection>
      )}

      {otherFields.length > 0 && (
        <div className="space-y-4">{otherFields.map(renderTopLevelField)}</div>
      )}
    </div>
  );

  return (
    <form {...getFormProps(form)} className="space-y-4">
      {hasDesignTab ? (
        <Tabs defaultValue="content">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="content">内容</TabsTrigger>
            <TabsTrigger value="design">デザイン</TabsTrigger>
          </TabsList>
          <TabsContent value="content" forceMount>
            {contentBlock}
          </TabsContent>
          <TabsContent value="design" forceMount className="space-y-4">
            {designFields.map(renderTopLevelField)}
            {advancedFields.length > 0 && (
              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-sm font-medium text-muted-foreground">
                  詳細設定
                </p>
                {advancedFields.map(renderTopLevelField)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        contentBlock
      )}

      <FormActions
        isDirty={isFormDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}

function AutoField<TForm extends Record<string, unknown>>({
  fieldInfo,
  field,
  form,
  isPending,
  defaultValue,
  dynamicOptions,
}: AutoFieldProps<TForm>) {
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
      mediaAccept={meta.mediaAccept}
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

function AutoFieldByType<TForm extends Record<string, unknown>>(
  props: AutoFieldByTypeProps<TForm>,
) {
  const {
    fieldType,
    fieldId,
    label,
    placeholder,
    helpText,
    suffix,
    leadingIcon,
    trailingIcon,
    mediaAccept,
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
        <AutoTextField
          field={field}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          leadingIcon={leadingIcon}
          trailingIcon={trailingIcon}
          isPending={isPending}
          error={error}
        />
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
        <AutoTextareaField
          field={field}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          isPending={isPending}
          error={error}
        />
      );

    case "number":
      return (
        <AutoNumberField
          field={field}
          fieldId={fieldId}
          label={label}
          suffix={suffix}
          helpText={helpText}
          leadingIcon={leadingIcon}
          trailingIcon={trailingIcon}
          isPending={isPending}
          error={error}
        />
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
        ReadonlyArray<DynamicCategoryOption> | undefined =
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

    case "media":
      return (
        <AutoMediaFieldControlled
          field={field}
          fieldId={fieldId}
          label={label}
          accept={mediaAccept ?? "image"}
          helpText={helpText}
          isPending={isPending}
          error={error}
        />
      );

    case "url":
      return (
        <AutoUrlField
          field={field}
          fieldId={fieldId}
          label={label}
          placeholder={placeholder}
          helpText={helpText}
          leadingIcon={leadingIcon}
          trailingIcon={trailingIcon}
          isPending={isPending}
          error={error}
        />
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
            <p
              id={field.errorId}
              role="alert"
              className="text-sm text-destructive"
            >
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

    default: {
      const _exhaustive: never = fieldType;
      return _exhaustive;
    }
  }
}
