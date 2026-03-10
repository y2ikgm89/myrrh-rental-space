"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Input,
  Label,
  Switch,
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
  contactFormConfigSchema,
  parseContactFormVariant,
  type ContactFormConfig,
  type ContactFormConfigInput,
} from "@/admin/lib/validations/homepage-section";
import { contactFormVariantLabels } from "@/shared/lib/validations/section-options";

export function ContactFormConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: ContactFormConfig;
  onSave: (config: ContactFormConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ContactFormConfigInput, unknown, ContactFormConfig>({
    resolver: zodResolver(contactFormConfigSchema),
    defaultValues: config,
  });

  const showNameField = useWatch({ control, name: "showNameField" });
  const showPhoneField = useWatch({ control, name: "showPhoneField" });
  const showSubjectField = useWatch({ control, name: "showSubjectField" });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="contact-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="contact-section-label"
            {...register("sectionLabel")}
            placeholder="Contact"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-title">タイトル</Label>
          <Input
            id="contact-title"
            {...register("title")}
            placeholder="お問い合わせ"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-description">説明（任意）</Label>
          <Textarea
            id="contact-description"
            {...register("description")}
            placeholder="お気軽にお問い合わせください"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-variant">バリエーション</Label>
          <Select
            defaultValue={config.variant}
            onValueChange={(v) =>
              setValue("variant", parseContactFormVariant(v))
            }
            disabled={isPending}
          >
            <SelectTrigger id="contact-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(contactFormVariantLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {contactFormVariantLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-submit-text">送信ボタンテキスト</Label>
          <Input
            id="contact-submit-text"
            {...register("submitButtonText")}
            placeholder="送信する"
            disabled={isPending}
          />
        </div>

        <div className="space-y-3">
          <Label>表示フィールド</Label>
          <div className="flex items-center gap-2">
            <Switch
              id="contact-show-name"
              checked={showNameField ?? false}
              onCheckedChange={(checked) => setValue("showNameField", checked)}
              disabled={isPending}
            />
            <Label htmlFor="contact-show-name">名前フィールドを表示</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="contact-show-phone"
              checked={showPhoneField ?? false}
              onCheckedChange={(checked) => setValue("showPhoneField", checked)}
              disabled={isPending}
            />
            <Label htmlFor="contact-show-phone">電話番号フィールドを表示</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="contact-show-subject"
              checked={showSubjectField ?? false}
              onCheckedChange={(checked) =>
                setValue("showSubjectField", checked)
              }
              disabled={isPending}
            />
            <Label htmlFor="contact-show-subject">件名フィールドを表示</Label>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
