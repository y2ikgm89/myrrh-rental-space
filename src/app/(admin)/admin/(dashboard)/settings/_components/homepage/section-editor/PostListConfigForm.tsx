"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  postListConfigSchema,
  parsePostLayout,
  parsePostImageAspect,
  type PostListConfig,
  type PostListConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  postLayoutLabels,
  postImageAspectLabels,
} from "@/shared/lib/validations/section-options";

export function PostListConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: PostListConfig;
  onSave: (config: PostListConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<PostListConfigInput, unknown, PostListConfig>({
    resolver: zodResolver(postListConfigSchema),
    defaultValues: config,
  });

  const showViewAllLink = useWatch({ control, name: "showViewAllLink" });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="posts-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="posts-section-label"
            {...register("sectionLabel")}
            placeholder="例: Blog"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-title">セクションタイトル</Label>
          <Input
            id="posts-title"
            {...register("title")}
            placeholder="最新の記事"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-max">表示件数</Label>
          <Input
            id="posts-max"
            type="number"
            min={1}
            max={20}
            {...register("maxItems", { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue("layout", parsePostLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="posts-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(postLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {postLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-columns">カラム数</Label>
          <Input
            id="posts-columns"
            type="number"
            min={1}
            max={4}
            {...register("columns", { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-image-aspect">画像アスペクト比</Label>
          <Select
            defaultValue={config.imageAspect}
            onValueChange={(v) =>
              setValue("imageAspect", parsePostImageAspect(v))
            }
            disabled={isPending}
          >
            <SelectTrigger id="posts-image-aspect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(postImageAspectLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {postImageAspectLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="posts-view-all"
            checked={showViewAllLink ?? false}
            onCheckedChange={(checked) => setValue("showViewAllLink", checked)}
            disabled={isPending}
          />
          <Label htmlFor="posts-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="posts-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="posts-view-all-text"
                {...register("viewAllText")}
                placeholder="全ての記事"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="posts-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="posts-view-all-url"
                {...register("viewAllUrl")}
                placeholder="/posts"
                disabled={isPending}
              />
            </div>
          </div>
        )}
      </div>

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
