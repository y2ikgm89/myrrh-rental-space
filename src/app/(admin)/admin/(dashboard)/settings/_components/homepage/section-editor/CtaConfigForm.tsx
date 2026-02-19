"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { Save } from "lucide-react";
import { keysOf } from "@/shared/lib/serialize";
import {
  ctaConfigSchema,
  parseCtaVariant,
  type CtaConfig,
  type CtaConfigInput,
  type CTAButtonItem,
} from "@/admin/lib/validations/homepage-section";
import { ctaVariantLabels } from "@/shared/lib/validations/section-options";
import { CTAButtonEditor } from "@/admin/components/cta-button-editor";

export function CtaConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: CtaConfig;
  onSave: (config: CtaConfig) => void;
  isPending: boolean;
}) {
  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CtaConfigInput, unknown, CtaConfig>({
    resolver: zodResolver(ctaConfigSchema),
    defaultValues: config,
  });

  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons);
    setValue("buttons", newButtons);
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
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
          <Label>ボタン</Label>
          <CTAButtonEditor
            buttons={buttons}
            onChange={handleButtonsChange}
            disabled={isPending}
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
