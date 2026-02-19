"use client";

import { useForm, useWatch } from "react-hook-form";
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
import { Save, Plus, Trash2, GripVertical } from "lucide-react";
import { keysOf } from "@/shared/lib/serialize";
import {
  featuresConfigSchema,
  parseFeaturesLayout,
  type FeaturesConfig,
  type FeaturesConfigInput,
} from "@/admin/lib/validations/homepage-section";
import { featuresLayoutLabels } from "@/shared/lib/validations/section-options";

const featureIconOptions = [
  { value: "clock", label: "時計" },
  { value: "shield", label: "シールド" },
  { value: "sparkles", label: "スパークル" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "star", label: "スター" },
  { value: "heart", label: "ハート" },
  { value: "zap", label: "電撃" },
  { value: "check", label: "チェック" },
] as const;

export function FeaturesConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: FeaturesConfig;
  onSave: (config: FeaturesConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FeaturesConfigInput, unknown, FeaturesConfig>({
    resolver: zodResolver(featuresConfigSchema),
    defaultValues: config,
  });

  const items = useWatch({ control, name: "items" }) ?? [];

  const addItem = () => {
    const newItems = [
      ...items,
      { icon: "sparkles", title: "", description: "" },
    ];
    setValue("items", newItems);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setValue("items", newItems);
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="features-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="features-section-label"
            {...register("sectionLabel")}
            placeholder="Features"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="features-title">タイトル</Label>
          <Input
            id="features-title"
            {...register("title")}
            placeholder="Features"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="features-columns">カラム数</Label>
          <Input
            id="features-columns"
            type="number"
            min={1}
            max={4}
            {...register("columns", { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="features-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue("layout", parseFeaturesLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="features-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(featuresLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {featuresLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>特徴アイテム</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              追加
            </Button>
          </div>

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
              アイテムがありません。「追加」ボタンで特徴を追加してください。
            </p>
          )}

          {items.map((item, index) => (
            <div key={index} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    アイテム {index + 1}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(index)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label>アイコン</Label>
                <Select
                  value={item.icon ?? "sparkles"}
                  onValueChange={(val) => {
                    const newItems = [...items];
                    const current = newItems[index];
                    if (current) {
                      newItems[index] = { ...current, icon: val };
                      setValue("items", newItems);
                    }
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {featureIconOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>タイトル</Label>
                <Input
                  {...register(`items.${index}.title`)}
                  placeholder="特徴のタイトル"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>説明</Label>
                <Textarea
                  {...register(`items.${index}.description`)}
                  placeholder="特徴の説明"
                  rows={2}
                  disabled={isPending}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
