"use client";

import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/admin/components/ui";
import {
  newsListConfigSchema,
  getNewsListConfig,
  parseNewsLayout,
  type NewsListConfig,
  type NewsListConfigInput,
} from "@/shared/lib/validations/section";
import { newsLayoutLabels } from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function NewsListConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getNewsListConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<NewsListConfigInput, unknown, NewsListConfig>({
    resolver: standardSchemaResolver(newsListConfigSchema),
    defaultValues: config,
  });

  const showViewAllLink = useWatch({ control, name: "showViewAllLink" });

  return (
    <form
      onSubmit={handleSubmit((data) => onSave({ config: data }))}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="news-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="news-section-label"
            {...register("sectionLabel")}
            placeholder="例: News"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-title">タイトル</Label>
          <Input
            id="news-title"
            {...register("title")}
            placeholder="お知らせ"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-max">表示件数</Label>
          <Input
            id="news-max"
            type="number"
            min={1}
            max={20}
            {...register("maxItems", { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-columns">カラム数（カードレイアウト時）</Label>
          <Input
            id="news-columns"
            type="number"
            min={2}
            max={4}
            {...register("columns", { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue("layout", parseNewsLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="news-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(newsLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {newsLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="news-view-all"
            checked={config.showViewAllLink}
            onCheckedChange={(checked) => setValue("showViewAllLink", checked)}
            disabled={isPending}
          />
          <Label htmlFor="news-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="news-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="news-view-all-text"
                {...register("viewAllText")}
                placeholder="全てのお知らせ"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="news-view-all-url"
                {...register("viewAllUrl")}
                placeholder="/news"
                disabled={isPending}
              />
            </div>
          </div>
        )}
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}
