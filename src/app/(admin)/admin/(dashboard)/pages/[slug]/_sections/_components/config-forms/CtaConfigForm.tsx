"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";
import { CTAButtonEditor } from "@/admin/components/cta-button-editor";
import {
  ctaConfigSchema,
  parseCtaVariant,
  type CtaConfig,
  type CtaConfigInput,
  type CTAButtonItem,
} from "@/shared/lib/validations/section";
import { getCtaConfig } from "@/shared/lib/validations/section-defaults";
import { ctaVariantLabels } from "@/shared/lib/validations/section-options";
import { keysOf, omitUndefined } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function CtaConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getCtaConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CtaConfigInput, unknown, CtaConfig>({
    resolver: standardSchemaResolver(ctaConfigSchema),
    defaultValues: config,
  });

  const [buttons, setButtons] = useState<CTAButtonItem[]>(
    config.buttons.map((b) => omitUndefined(b)),
  );
  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons);
    setValue("buttons", newButtons);
  };

  return (
    <form
      onSubmit={handleSubmit((data) => onSave({ config: data }))}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cta-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="cta-section-label"
            {...register("sectionLabel")}
            placeholder="例: Ready to Begin?"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-title">タイトル</Label>
          <Input
            id="cta-title"
            {...register("title")}
            placeholder="ご予約・お問い合わせ"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-description">説明（任意）</Label>
          <Textarea
            id="cta-description"
            {...register("description")}
            placeholder="説明文を入力"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-variant">バリエーション</Label>
          <Select
            defaultValue={config.variant}
            onValueChange={(v) => setValue("variant", parseCtaVariant(v))}
            disabled={isPending}
          >
            <SelectTrigger id="cta-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(ctaVariantLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {ctaVariantLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-bg-color">背景色（任意）</Label>
          <Input
            id="cta-bg-color"
            {...register("backgroundColor")}
            placeholder="例: #f5f5f5"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>ボタン</Label>
          <CTAButtonEditor
            buttons={buttons}
            onChange={handleButtonsChange}
            disabled={isPending}
          />
        </div>
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}
