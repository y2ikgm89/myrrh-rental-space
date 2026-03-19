"use client";

import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";

import { keysOf } from "@/shared/lib/serialize";
import {
  faqListConfigSchema,
  parseFaqVariant,
  parseContainerWidth,
  parseFaqInitialOpen,
  type FaqListConfig,
  type FaqListConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  faqVariantLabels,
  containerWidthLabels,
  faqInitialOpenLabels,
} from "@/shared/lib/validations/section-options";

export function FaqListConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: FaqListConfig;
  onSave: (config: FaqListConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FaqListConfigInput, unknown, FaqListConfig>({
    resolver: standardSchemaResolver(faqListConfigSchema),
    defaultValues: config,
  });

  const showViewAllLink = useWatch({ control, name: "showViewAllLink" });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="faq-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="faq-section-label"
            {...register("sectionLabel")}
            placeholder="例: FAQ"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-title">セクションタイトル</Label>
          <Input
            id="faq-title"
            {...register("title")}
            placeholder="よくあるご質問"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-category">FAQカテゴリID（任意）</Label>
          <Input
            id="faq-category"
            {...register("categoryId")}
            placeholder="特定カテゴリのFAQを表示する場合"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            空欄の場合はカスタムFAQ項目を使用
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-max">最大表示件数</Label>
          <Input
            id="faq-max"
            type="number"
            min={1}
            max={50}
            {...register("maxItems", { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-variant">バリエーション</Label>
          <Select
            defaultValue={config.variant}
            onValueChange={(v) => setValue("variant", parseFaqVariant(v))}
            disabled={isPending}
          >
            <SelectTrigger id="faq-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(faqVariantLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {faqVariantLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="faq-container-width">コンテナ幅</Label>
            <Select
              defaultValue={config.containerWidth}
              onValueChange={(v) =>
                setValue("containerWidth", parseContainerWidth(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="faq-container-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(containerWidthLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {containerWidthLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-initial-open">初期開閉状態</Label>
            <Select
              defaultValue={config.initialOpen}
              onValueChange={(v) =>
                setValue("initialOpen", parseFaqInitialOpen(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="faq-initial-open">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(faqInitialOpenLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {faqInitialOpenLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="faq-view-all"
            checked={showViewAllLink ?? false}
            onCheckedChange={(checked) => setValue("showViewAllLink", checked)}
            disabled={isPending}
          />
          <Label htmlFor="faq-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="faq-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="faq-view-all-text"
                {...register("viewAllText")}
                placeholder="全てのFAQ"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faq-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="faq-view-all-url"
                {...register("viewAllUrl")}
                placeholder="/faq"
                disabled={isPending}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <SubmitButton isPending={isPending} label="保存" />
      </div>
    </form>
  );
}
