"use client";

/**
 * DesignPanel — セクション共通デザイン編集パネル
 *
 * Accordion で4カテゴリに整理:
 *   余白 / 背景 / テキスト / レイアウト
 * ToggleGroup で視覚的な選択UI。
 */

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
} from "@tabler/icons-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  ToggleGroup,
  ToggleGroupItem,
} from "@/admin/components/ui";

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
// Types
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
  { value: "default", label: "標準", chip: "bg-background border" },
  { value: "surface", label: "表面", chip: "bg-muted" },
  { value: "accent", label: "淡色", chip: "bg-primary/10" },
  { value: "primary", label: "強調", chip: "bg-primary/20" },
  { value: "dark", label: "暗色", chip: "bg-foreground" },
  { value: "image", label: "画像", chip: "bg-muted border-dashed" },
] as const;

const maxWidthOptions = [
  { value: "sm", label: "S", sub: "768" },
  { value: "md", label: "M", sub: "896" },
  { value: "lg", label: "L", sub: "1152" },
  { value: "xl", label: "XL", sub: "1280" },
  { value: "full", label: "全幅", sub: "" },
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

const animationOptions = [
  { value: "none", label: "なし" },
  { value: "fade", label: "フェード" },
  { value: "slide-up", label: "スライドアップ" },
  { value: "parallax", label: "パララックス" },
] as const;

// =============================================================================
// Type guards for ToggleGroup onValueChange (string → union narrowing)
// =============================================================================

const paddingValueSet = new Set<string>(paddingOptions.map((o) => o.value));
type PaddingValue = (typeof paddingOptions)[number]["value"];
function isPaddingValue(v: string): v is PaddingValue {
  return paddingValueSet.has(v);
}

const bgValueSet = new Set<string>(backgroundOptions.map((o) => o.value));
type BgValue = (typeof backgroundOptions)[number]["value"];
function isBgValue(v: string): v is BgValue {
  return bgValueSet.has(v);
}

const maxWidthValueSet = new Set<string>(maxWidthOptions.map((o) => o.value));
type MaxWidthValue = (typeof maxWidthOptions)[number]["value"];
function isMaxWidthValue(v: string): v is MaxWidthValue {
  return maxWidthValueSet.has(v);
}

const textAlignValues = ["left", "center", "right"] as const;
type TextAlignValue = (typeof textAlignValues)[number];
const textAlignValueSet = new Set<string>(textAlignValues);
function isTextAlignValue(v: string): v is TextAlignValue {
  return textAlignValueSet.has(v);
}

// =============================================================================
// Component
// =============================================================================

interface DesignPanelProps {
  readonly section: SectionDesignTarget;
  readonly onDesignSave: (design: SectionDesign) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

export function DesignPanel({
  section,
  onDesignSave,
  onDirtyChange,
}: DesignPanelProps) {
  const currentDesign = parseSectionDesign(section.design);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty },
  } = useForm<SectionDesignInput, unknown, SectionDesign>({
    resolver: standardSchemaResolver(sectionDesignSchema),
    defaultValues: currentDesign,
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const paddingTop = useWatch({ control, name: "paddingTop" });
  const paddingBottom = useWatch({ control, name: "paddingBottom" });
  const background = useWatch({ control, name: "background" });
  const titleSize = useWatch({ control, name: "titleSize" });
  const titleColor = useWatch({ control, name: "titleColor" });
  const textColor = useWatch({ control, name: "textColor" });
  const textAlign = useWatch({ control, name: "textAlign" });
  const maxWidth = useWatch({ control, name: "maxWidth" });
  const animation = useWatch({ control, name: "animation" });

  return (
    <form onSubmit={handleSubmit(onDesignSave)} className="space-y-4">
      <Accordion
        type="multiple"
        defaultValue={["spacing", "background", "text", "layout"]}
        className="space-y-2"
      >
        {/* ── 余白 ───────────────────────────────── */}
        <AccordionItem
          value="spacing"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            余白
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">上余白</Label>
              <ToggleGroup
                type="single"
                value={paddingTop ?? "lg"}
                onValueChange={(v) => {
                  if (v && isPaddingValue(v))
                    setValue("paddingTop", v, { shouldDirty: true });
                }}
                className="w-full justify-start"
              >
                {paddingOptions.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">下余白</Label>
              <ToggleGroup
                type="single"
                value={paddingBottom ?? "lg"}
                onValueChange={(v) => {
                  if (v && isPaddingValue(v))
                    setValue("paddingBottom", v, { shouldDirty: true });
                }}
                className="w-full justify-start"
              >
                {paddingOptions.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── 背景 ───────────────────────────────── */}
        <AccordionItem
          value="background"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            背景
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                背景スタイル
              </Label>
              <ToggleGroup
                type="single"
                value={background ?? "default"}
                onValueChange={(v) => {
                  if (v && isBgValue(v))
                    setValue("background", v, { shouldDirty: true });
                }}
                className="w-full flex-wrap justify-start"
              >
                {backgroundOptions.map((opt) => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    className="gap-1.5"
                  >
                    <span
                      className={`inline-block h-3 w-3 rounded-sm border ${opt.chip}`}
                    />
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {background === "image" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="design-bg-image" className="text-xs">
                    背景画像URL
                  </Label>
                  <Input
                    id="design-bg-image"
                    {...register("backgroundImageUrl")}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="design-overlay" className="text-xs">
                    オーバーレイ不透明度 (%)
                  </Label>
                  <Input
                    id="design-overlay"
                    type="number"
                    min={0}
                    max={100}
                    {...register("backgroundOverlayOpacity", {
                      valueAsNumber: true,
                    })}
                  />
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ── テキスト ──────────────────────────── */}
        <AccordionItem
          value="text"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            テキスト
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* タイトル色 */}
              <div className="space-y-2">
                <Label className="text-xs">タイトル色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={titleColor || "#000000"}
                    onChange={(e) =>
                      setValue("titleColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    value={titleColor || ""}
                    onChange={(e) =>
                      setValue("titleColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    placeholder="#000000"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  空欄でデフォルト色
                </p>
              </div>

              {/* タイトルサイズ */}
              <div className="space-y-2">
                <Label className="text-xs">タイトルサイズ</Label>
                <Select
                  {...(titleSize !== undefined && { value: titleSize })}
                  onValueChange={(val) => {
                    if (isTitleSize(val))
                      setValue("titleSize", val, { shouldDirty: true });
                  }}
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

              {/* テキスト色 */}
              <div className="space-y-2">
                <Label className="text-xs">テキスト色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={textColor || "#666666"}
                    onChange={(e) =>
                      setValue("textColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    value={textColor || ""}
                    onChange={(e) =>
                      setValue("textColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    placeholder="#666666"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  空欄でデフォルト色
                </p>
              </div>

              {/* テキスト配置 */}
              <div className="space-y-2">
                <Label className="text-xs">テキスト配置</Label>
                <ToggleGroup
                  type="single"
                  value={textAlign ?? "left"}
                  onValueChange={(v) => {
                    if (v && isTextAlignValue(v))
                      setValue("textAlign", v, { shouldDirty: true });
                  }}
                >
                  <ToggleGroupItem value="left" aria-label="左揃え">
                    <IconAlignLeft className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="center" aria-label="中央揃え">
                    <IconAlignCenter className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="right" aria-label="右揃え">
                    <IconAlignRight className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── レイアウト ─────────────────────────── */}
        <AccordionItem
          value="layout"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            レイアウト
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                コンテナ幅
              </Label>
              <ToggleGroup
                type="single"
                value={maxWidth ?? "lg"}
                onValueChange={(v) => {
                  if (v && isMaxWidthValue(v))
                    setValue("maxWidth", v, { shouldDirty: true });
                }}
                className="w-full justify-start"
              >
                {maxWidthOptions.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    <span>{opt.label}</span>
                    {opt.sub && (
                      <span className="text-[10px] text-muted-foreground">
                        {opt.sub}
                      </span>
                    )}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                アニメーション
              </Label>
              <Select
                {...(animation !== undefined && { value: animation })}
                onValueChange={(val) => {
                  if (isSectionAnimation(val))
                    setValue("animation", val, { shouldDirty: true });
                }}
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

            <div className="space-y-2">
              <Label htmlFor="design-custom-class" className="text-xs">
                カスタムCSSクラス
              </Label>
              <Input
                id="design-custom-class"
                {...register("customClass")}
                placeholder="追加のTailwindクラス"
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end pt-2">
        <SubmitButton
          isPending={false}
          label="デザインを保存"
          pendingLabel="保存中..."
        />
      </div>
    </form>
  );
}
