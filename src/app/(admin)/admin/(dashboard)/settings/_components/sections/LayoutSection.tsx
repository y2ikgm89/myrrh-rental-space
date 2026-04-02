"use client";

/**
 * レイアウト設定セクション
 *
 * サイト全体の幅と記事コンテンツ幅を設定
 * 比率プレビュー付き
 */

import { useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateLayoutSettings } from "@/admin/actions/settings";
import { layoutFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { LayoutWidth } from "@generated/prisma/enums";
import { isValidLayoutWidth } from "@/shared/lib/validations/enums/guards";
import { getValidLayoutWidth } from "@/shared/lib/validations/enums/helpers";
import {
  SITE_WIDTH_PRESETS,
  CONTENT_WIDTH_PRESETS,
} from "@/shared/lib/styles/layout-mapper";
import type { WidthPreset } from "@/shared/lib/styles/layout-mapper";
import { keysOf } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

interface LayoutSectionProps {
  settings: Serialized<SettingsData>;
}

// =============================================================================
// Helpers
// =============================================================================

function buildOptions(
  presets: Record<LayoutWidth, WidthPreset>,
  exclude: LayoutWidth,
) {
  return keysOf(presets)
    .filter((key) => key !== exclude)
    .map((key) => {
      const preset = presets[key];
      return {
        value: key,
        label: preset.px ? `${preset.label} (${preset.px}px)` : preset.label,
      };
    });
}

const siteWidthOptions = buildOptions(SITE_WIDTH_PRESETS, LayoutWidth.XS);
const contentWidthOptions = buildOptions(
  CONTENT_WIDTH_PRESETS,
  LayoutWidth.FULL,
);

function resolvePresetPx(
  width: LayoutWidth,
  customValue: string,
  presets: Record<LayoutWidth, WidthPreset>,
): number | null {
  if (width === LayoutWidth.FULL) return null;
  if (width === LayoutWidth.CUSTOM) {
    const parsed = customValue ? parseInt(customValue, 10) : null;
    return parsed !== null && !Number.isNaN(parsed) ? parsed : null;
  }
  return presets[width].px;
}

// =============================================================================
// Component
// =============================================================================

export function LayoutSection({ settings }: LayoutSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    layoutFormSchema,
    (data) =>
      updateLayoutSettings({
        containerWidth: data.containerWidth,
        containerWidthCustom:
          data.containerWidth === LayoutWidth.CUSTOM
            ? parseInt(data.containerWidthCustom, 10) || null
            : null,
        contentWidth: data.contentWidth,
        contentWidthCustom:
          data.contentWidth === LayoutWidth.CUSTOM
            ? parseInt(data.contentWidthCustom, 10) || null
            : null,
      }),
    {
      defaultValues: {
        containerWidth: getValidLayoutWidth(
          settings.containerWidth,
          LayoutWidth.LG,
        ),
        containerWidthCustom: settings.containerWidthCustom?.toString() || "",
        contentWidth: getValidLayoutWidth(
          settings.contentWidth,
          LayoutWidth.MD,
        ),
        contentWidthCustom: settings.contentWidthCustom?.toString() || "",
      },
      refresh: true,
      successMessage: "レイアウト設定を保存しました",
    },
  );

  const containerWidth = useWatch({
    control: form.control,
    name: "containerWidth",
  });
  const contentWidth = useWatch({
    control: form.control,
    name: "contentWidth",
  });
  const containerWidthCustom = useWatch({
    control: form.control,
    name: "containerWidthCustom",
  });
  const contentWidthCustom = useWatch({
    control: form.control,
    name: "contentWidthCustom",
  });

  const resolvedSitePx = resolvePresetPx(
    containerWidth,
    containerWidthCustom,
    SITE_WIDTH_PRESETS,
  );
  const resolvedContentPx = resolvePresetPx(
    contentWidth,
    contentWidthCustom,
    CONTENT_WIDTH_PRESETS,
  );

  const contentRatio =
    resolvedContentPx && resolvedSitePx
      ? Math.round((resolvedContentPx / resolvedSitePx) * 100)
      : null;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>レイアウト設定</CardTitle>
            <CardDescription>
              サイト全体の幅と記事コンテンツの表示幅を設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 幅設定 */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* サイト全体の幅 */}
              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">サイト全体の幅</h4>
                  <p className="text-xs text-muted-foreground">
                    ヘッダー、フッター、コンテンツ領域全体の最大幅
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="containerWidth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>サイト幅</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            if (isValidLayoutWidth(value))
                              field.onChange(value);
                          }}
                          disabled={isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="幅を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {siteWidthOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {containerWidth === LayoutWidth.CUSTOM && (
                  <FormField
                    control={form.control}
                    name="containerWidthCustom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>カスタム幅 (px)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min="320"
                            max="2560"
                            placeholder="例: 1400"
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          320px〜2560pxの範囲で入力
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* 記事コンテンツの幅 */}
              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">記事コンテンツの幅</h4>
                  <p className="text-xs text-muted-foreground">
                    ブログ記事、お知らせ、静的ページの表示幅
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="contentWidth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>コンテンツ幅</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            if (isValidLayoutWidth(value))
                              field.onChange(value);
                          }}
                          disabled={isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="幅を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {contentWidthOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {contentWidth === LayoutWidth.CUSTOM && (
                  <FormField
                    control={form.control}
                    name="contentWidthCustom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>カスタム幅 (px)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min="320"
                            max="1920"
                            placeholder="例: 900"
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          320px〜1920pxの範囲で入力
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            {/* レイアウトプレビュー（比率表示） */}
            <div className="space-y-2">
              <p className="text-sm font-medium">レイアウトプレビュー</p>
              <div className="rounded-lg border px-4 py-4">
                {/* サイト幅 = 100% */}
                <div className="rounded border border-dashed border-foreground/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>サイト幅</span>
                    <span className="font-mono">
                      {resolvedSitePx ? `${resolvedSitePx}px` : "全幅"}
                    </span>
                  </div>
                  {/* コンテンツ幅 = 比率 */}
                  <div
                    className="mx-auto mt-2.5 rounded border border-dashed border-primary/40 bg-background px-3 py-2.5"
                    style={{
                      width: contentRatio ? `${contentRatio}%` : "100%",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>コンテンツ領域</span>
                      <span className="font-mono">
                        {resolvedContentPx ? `${resolvedContentPx}px` : "全幅"}
                        {contentRatio !== null && (
                          <span className="ml-1 opacity-60">
                            ({contentRatio}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <div className="h-2 rounded-full bg-muted" />
                      <div className="h-2 w-4/5 rounded-full bg-muted" />
                      <div className="h-2 w-3/5 rounded-full bg-muted" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 保存 */}
            <div className="flex justify-end">
              <SubmitButton
                isPending={isPending}
                label="保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
