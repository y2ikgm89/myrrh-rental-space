"use client";

/**
 * DesignPanel — セクション共通デザイン編集パネル
 *
 * sectionDesignSchema の全フィールドを編集可能。
 * 余白、背景、テキストスタイリング、レイアウト、アニメーションを管理。
 */

import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";

import {
  updateHomepageSection,
  type HomepageSectionData,
} from "@/admin/actions/homepage-settings";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  sectionDesignSchema,
  parseSectionDesign,
  titleSizeValues,
  isTitleSize,
  isSectionAnimation,
  type SectionDesign,
  type SectionDesignInput,
  type TitleSize,
} from "@/shared/lib/validations/section";

// =============================================================================
// 汎用型 — PageSection / HomepageSection 両対応
// =============================================================================

export interface SectionDesignTarget {
  id: string;
  type: string;
  design: unknown;
}

// =============================================================================
// Option definitions
// =============================================================================

const paddingOptions = [
  { value: "none", label: "なし" },
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
  { value: "xl", label: "特大" },
] as const;

const backgroundOptions = [
  { value: "default", label: "デフォルト" },
  { value: "surface", label: "サーフェス" },
  { value: "accent", label: "アクセント" },
  { value: "primary", label: "プライマリ" },
  { value: "dark", label: "ダーク" },
  { value: "image", label: "画像" },
  { value: "gradient", label: "グラデーション" },
] as const;

const maxWidthOptions = [
  { value: "sm", label: "小 (768px)" },
  { value: "md", label: "中 (896px)" },
  { value: "lg", label: "大 (1152px)" },
  { value: "xl", label: "特大 (1280px)" },
  { value: "full", label: "全幅" },
] as const;

const titleSizeLabels = {
  sm: "小",
  md: "中",
  lg: "大",
  xl: "特大",
  "2xl": "超特大",
  "3xl": "ヒーロー",
} satisfies Record<TitleSize, string>;

const titleSizeOptions = titleSizeValues.map((v) => ({
  value: v,
  label: titleSizeLabels[v],
}));

const textAlignOptions = [
  { value: "left", label: "左揃え" },
  { value: "center", label: "中央揃え" },
  { value: "right", label: "右揃え" },
] as const;

const animationOptions = [
  { value: "none", label: "なし" },
  { value: "fade", label: "フェード" },
  { value: "slide-up", label: "スライドアップ" },
  { value: "parallax", label: "パララックス" },
] as const;

// =============================================================================
// Component
// =============================================================================

// ホームページセクション用（既存互換）
interface HomepageDesignPanelProps {
  readonly section: HomepageSectionData;
  readonly onSave: () => void;
  readonly onDesignSave?: never;
}

// 汎用（Page セクション等）
interface GenericDesignPanelProps {
  readonly section: SectionDesignTarget;
  readonly onDesignSave: (design: SectionDesign) => void;
  readonly onSave?: never;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

type DesignPanelProps = HomepageDesignPanelProps | GenericDesignPanelProps;

export function DesignPanel(props: DesignPanelProps) {
  const { section } = props;
  const [isPending, startTransition] = useTransition();
  const currentDesign = parseSectionDesign(section.design);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty },
  } = useForm<SectionDesignInput, unknown, SectionDesign>({
    resolver: zodResolver(sectionDesignSchema),
    defaultValues: currentDesign,
  });

  // Generic mode: dirty状態をバブルアップ
  useEffect(() => {
    if ("onDirtyChange" in props && props.onDirtyChange) {
      props.onDirtyChange(isDirty);
    }
  }, [isDirty, props]);

  const background = useWatch({ control, name: "background" });
  const titleSize = useWatch({ control, name: "titleSize" });
  const titleColor = useWatch({ control, name: "titleColor" });
  const textColor = useWatch({ control, name: "textColor" });
  const animation = useWatch({ control, name: "animation" });

  const handleDesignSave = (data: SectionDesign) => {
    // 汎用モード: onDesignSave コールバックに委譲
    if (props.onDesignSave) {
      props.onDesignSave(data);
      return;
    }

    // ホームページモード: 直接保存
    startTransition(async () => {
      const result = await updateHomepageSection(section.id, {
        design: data,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("デザインを保存しました");
      props.onSave();
    });
  };

  return (
    <form onSubmit={handleSubmit(handleDesignSave)} className="space-y-8">
      {/* 余白 */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">余白</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>上余白</Label>
            <div className="flex gap-2">
              {paddingOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value={opt.value}
                    {...register("paddingTop")}
                    disabled={isPending}
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>下余白</Label>
            <div className="flex gap-2">
              {paddingOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value={opt.value}
                    {...register("paddingBottom")}
                    disabled={isPending}
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      {/* 背景 */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">背景</legend>
        <div className="space-y-2">
          <Label>背景スタイル</Label>
          <div className="flex flex-wrap gap-2">
            {backgroundOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  value={opt.value}
                  {...register("background")}
                  disabled={isPending}
                />
                <span className="text-xs">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {background === "image" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="design-bg-image">背景画像URL</Label>
              <Input
                id="design-bg-image"
                {...register("backgroundImageUrl")}
                placeholder="https://..."
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="design-overlay">オーバーレイ不透明度 (%)</Label>
              <Input
                id="design-overlay"
                type="number"
                min={0}
                max={100}
                {...register("backgroundOverlayOpacity", {
                  valueAsNumber: true,
                })}
                disabled={isPending}
              />
            </div>
          </>
        )}
      </fieldset>

      {/* テキスト */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">テキスト</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="design-title-color">タイトル色</Label>
            <div className="flex items-center gap-2">
              <Input
                id="design-title-color"
                {...register("titleColor")}
                placeholder="#000000"
                disabled={isPending}
                className="flex-1"
              />
              {titleColor && (
                <div
                  className="h-8 w-8 shrink-0 rounded border"
                  style={{ backgroundColor: titleColor }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">空欄でデフォルト色</p>
          </div>

          <div className="space-y-2">
            <Label>タイトルサイズ</Label>
            <Select
              {...(titleSize !== undefined && { value: titleSize })}
              onValueChange={(val) => {
                if (isTitleSize(val)) setValue("titleSize", val);
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {titleSizeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="design-text-color">テキスト色</Label>
            <div className="flex items-center gap-2">
              <Input
                id="design-text-color"
                {...register("textColor")}
                placeholder="#666666"
                disabled={isPending}
                className="flex-1"
              />
              {textColor && (
                <div
                  className="h-8 w-8 shrink-0 rounded border"
                  style={{ backgroundColor: textColor }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">空欄でデフォルト色</p>
          </div>

          <div className="space-y-2">
            <Label>テキスト配置</Label>
            <div className="flex gap-4">
              {textAlignOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value={opt.value}
                    {...register("textAlign")}
                    disabled={isPending}
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      {/* レイアウト */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">レイアウト</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>コンテナ幅</Label>
            <div className="flex flex-wrap gap-2">
              {maxWidthOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value={opt.value}
                    {...register("maxWidth")}
                    disabled={isPending}
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>アニメーション</Label>
            <Select
              {...(animation !== undefined && { value: animation })}
              onValueChange={(val) => {
                if (isSectionAnimation(val)) setValue("animation", val);
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {animationOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      {/* カスタムCSS */}
      <div className="space-y-2">
        <Label htmlFor="design-custom-class">カスタムCSSクラス（任意）</Label>
        <Input
          id="design-custom-class"
          {...register("customClass")}
          placeholder="追加のTailwindクラス"
          disabled={isPending}
        />
      </div>

      <SubmitButton
        isPending={isPending}
        label="デザインを保存"
        pendingLabel="保存中..."
      />
    </form>
  );
}
