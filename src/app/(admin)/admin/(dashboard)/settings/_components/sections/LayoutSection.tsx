"use client";

/**
 * レイアウト設定セクション
 *
 * サイト全体の幅と記事コンテンツ幅を設定
 * リアルタイムプレビュー付き
 */

import { useWatch } from "react-hook-form";
import {
  Button,
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
import { layoutFormSchema } from "@/admin/actions/settings/schemas";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import {
  LayoutWidth,
  isValidLayoutWidth,
  getValidLayoutWidth,
} from "@/shared/lib/validations/enums";
import {
  SITE_WIDTH_PRESETS,
  CONTENT_WIDTH_PRESETS,
  resolveWidthStyles,
} from "@/shared/lib/styles/layout-mapper";
import { keysOf } from "@/shared/lib/serialize";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";

// =============================================================================
// Types
// =============================================================================

interface LayoutSectionProps {
  settings: Serialized<SettingsData>;
}

// =============================================================================
// Options (derived from PRESETS — Single Source of Truth)
// =============================================================================

const siteWidthOptions = keysOf(SITE_WIDTH_PRESETS)
  .filter((key) => key !== LayoutWidth.XS)
  .map((key) => {
    const preset = SITE_WIDTH_PRESETS[key];
    return {
      value: key,
      label: preset.px ? `${preset.label} (${preset.px}px)` : preset.label,
      description: preset.description,
    };
  });

const contentWidthOptions = keysOf(CONTENT_WIDTH_PRESETS)
  .filter((key) => key !== LayoutWidth.FULL)
  .map((key) => {
    const preset = CONTENT_WIDTH_PRESETS[key];
    return {
      value: key,
      label: preset.px ? `${preset.label} (${preset.px}px)` : preset.label,
      description: preset.description,
    };
  });

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
  const contentWidthCustom = useWatch({
    control: form.control,
    name: "contentWidthCustom",
  });

  const handlePreview = () => {
    window.open("/posts", "_blank");
  };

  // リアルタイムプレビュー用スタイル計算
  const parsedCustomWidth = contentWidthCustom
    ? parseInt(contentWidthCustom, 10)
    : null;
  const validCustomWidth =
    parsedCustomWidth !== null && !Number.isNaN(parsedCustomWidth)
      ? parsedCustomWidth
      : null;

  const previewStyles = resolveWidthStyles({
    width: contentWidth,
    customPx: validCustomWidth,
  });

  // サンプルコンテンツ
  const sampleContent = `<p>これはコンテンツ幅のプレビューです。設定を変更すると、このエディタの幅がリアルタイムで変わります。</p><p>実際のブログ記事やお知らせは、ここに表示されるのと同じ幅で公開ページに表示されます。</p>`;

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
                                <div className="flex flex-col">
                                  <span>{option.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                </div>
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
                                <div className="flex flex-col">
                                  <span>{option.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                </div>
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

            {/* コンテンツ幅プレビュー */}
            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">コンテンツ幅プレビュー</h4>
                <p className="text-xs text-muted-foreground">
                  設定した幅でエディタがどのように表示されるか確認できます
                </p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 overflow-x-auto">
                <LazyLexicalEditor
                  contentHtml={sampleContent}
                  disabled
                  className={EDITOR_PROSE_CLASSES}
                  showToolbar={false}
                  height="120px"
                  contentWidthClassName={previewStyles.className}
                  contentWidthStyle={previewStyles.style}
                />
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex items-center justify-end gap-4">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={isPending}
                type="button"
              >
                プレビュー
              </Button>
              <SubmitButton
                isPending={isPending}
                label="保存"
                disabled={!form.formState.isDirty}
              />
            </div>

            {/* ヒント */}
            <div className="rounded-lg bg-muted/50 p-4">
              <h4 className="font-medium mb-2">ヒント</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>設定を保存すると、サイト全体に即時反映されます</li>
                <li>個別の記事やページで幅を上書きすることもできます</li>
                <li>長文の記事は狭めの幅（720〜800px程度）が読みやすいです</li>
                <li>画像ギャラリーなどは広めの幅が適しています</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
