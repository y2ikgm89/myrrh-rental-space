"use client";

import { IconAperture } from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  SelectionBox,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useWatch } from "react-hook-form";
import { useFormAction } from "@/admin/hooks/useFormAction";
import {
  updateInstagramSettings,
  type InstagramConfig,
} from "@/admin/actions/instagram";
import { instagramFeedFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { InstagramFeedLayout } from "@generated/prisma/enums";
import { isValidInstagramFeedLayout } from "@/shared/lib/validations/enums/guards";

// =============================================================================
// Constants
// =============================================================================

const LAYOUT_OPTIONS = [
  {
    value: InstagramFeedLayout.grid,
    label: "グリッド",
    description: "写真を格子状に並べて表示",
  },
  {
    value: InstagramFeedLayout.masonry,
    label: "メイソンリー",
    description: "高さの異なるグリッドレイアウト",
  },
  {
    value: InstagramFeedLayout.slider,
    label: "スライダー",
    description: "横スクロールで表示",
  },
];

// =============================================================================
// Component
// =============================================================================

interface FeedSettingsCardProps {
  config: InstagramConfig;
  parentIsPending: boolean;
}

export function FeedSettingsCard({
  config,
  parentIsPending,
}: FeedSettingsCardProps) {
  const { form, isPending, onSubmit } = useFormAction(
    instagramFeedFormSchema,
    (data) => updateInstagramSettings(data),
    {
      defaultValues: {
        feedEnabled: config.feedEnabled,
        feedLayout: config.feedLayout,
        feedColumns: config.feedColumns,
        feedMaxItems: config.feedMaxItems,
        showCaption: config.showCaption,
        showViewAll: config.showViewAll,
      },
      refresh: true,
      successMessage: "Instagram設定を保存しました",
    },
  );

  const feedEnabled = useWatch({ control: form.control, name: "feedEnabled" });
  const formIsPending = isPending || parentIsPending;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconAperture className="h-5 w-5" />
              フィード表示設定
            </CardTitle>
            <CardDescription>
              ホームページや固定ページでのInstagram投稿の表示設定
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* フィード有効化 */}
            <FormField
              control={form.control}
              name="feedEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>フィードを有効化</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      ホームページにInstagramフィードを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={formIsPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* レイアウト選択 */}
            <FormField
              control={form.control}
              name="feedLayout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>レイアウト</FormLabel>
                  <FormControl>
                    <SelectionBox
                      options={LAYOUT_OPTIONS}
                      value={field.value}
                      onChange={(value) => {
                        if (isValidInstagramFeedLayout(value)) {
                          field.onChange(value);
                        }
                      }}
                      columns={3}
                      disabled={formIsPending || !feedEnabled}
                      name="feed-layout"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 列数 */}
            <FormField
              control={form.control}
              name="feedColumns"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>列数</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.valueAsNumber || 3)
                      }
                      type="number"
                      min={2}
                      max={6}
                      disabled={formIsPending || !feedEnabled}
                      className="w-24"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    2〜6の範囲で指定
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 表示件数 */}
            <FormField
              control={form.control}
              name="feedMaxItems"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>表示件数</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.valueAsNumber || 6)
                      }
                      type="number"
                      min={1}
                      max={24}
                      disabled={formIsPending || !feedEnabled}
                      className="w-24"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    1〜24の範囲で指定
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* キャプション表示 */}
            <FormField
              control={form.control}
              name="showCaption"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>キャプションを表示</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      投稿のキャプションを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={formIsPending || !feedEnabled}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* もっと見るリンク */}
            <FormField
              control={form.control}
              name="showViewAll"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>「もっと見る」リンク</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Instagramプロフィールへのリンクを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={formIsPending || !feedEnabled}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* 保存ボタン */}
            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
