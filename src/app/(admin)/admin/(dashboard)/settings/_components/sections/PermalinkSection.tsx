"use client";

/**
 * パーマリンク設定セクション
 *
 * 投稿記事のURL構造とプレフィックス表示を設定
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
  FormField,
  FormItem,
  FormLabel,
  SelectionBox,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updatePermalinkSettings } from "@/admin/actions/settings";
import { permalinkFormSchema } from "@/admin/actions/settings/schemas";
import { PostPermalinkStructure } from "@/shared/db/enums";
import {
  isValidPostPermalinkStructure,
  getValidPostPermalinkStructure,
} from "@/shared/lib/validations/enums";
import type { SelectionBoxOption } from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type PermalinkSectionProps = {
  settings: {
    postPermalinkStructure: PostPermalinkStructure | null;
    postUrlPrefixEnabled: boolean;
  };
};

// =============================================================================
// Constants
// =============================================================================

const PERMALINK_OPTIONS: SelectionBoxOption[] = [
  {
    value: PostPermalinkStructure.post_name,
    label: "シンプル",
    description: "記事名のみのシンプルなURL",
  },
  {
    value: PostPermalinkStructure.date_name,
    label: "日付+記事名",
    description: "公開日が含まれるURL",
  },
  {
    value: PostPermalinkStructure.category_name,
    label: "カテゴリ+記事名",
    description: "カテゴリ階層を含むURL",
  },
];

// =============================================================================
// Component
// =============================================================================

export function PermalinkSection({ settings }: PermalinkSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    permalinkFormSchema,
    (data) =>
      updatePermalinkSettings({
        postPermalinkStructure: data.postPermalinkStructure,
        postUrlPrefixEnabled: data.postUrlPrefixEnabled,
      }),
    {
      defaultValues: {
        postPermalinkStructure: getValidPostPermalinkStructure(
          settings.postPermalinkStructure,
        ),
        postUrlPrefixEnabled: settings.postUrlPrefixEnabled,
      },
      refresh: true,
      successMessage: "パーマリンク設定を保存しました",
    },
  );

  const [structure, prefixEnabled] = useWatch({
    control: form.control,
    name: ["postPermalinkStructure", "postUrlPrefixEnabled"],
  });

  const getPreviewUrl = () => {
    const prefix = prefixEnabled ? "/posts" : "";
    switch (structure) {
      case PostPermalinkStructure.date_name:
        return `${prefix}/2026/01/article-title`;
      case PostPermalinkStructure.category_name:
        return `${prefix}/technology/article-title`;
      case PostPermalinkStructure.post_name:
      default:
        return `${prefix}/article-title`;
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>パーマリンク設定</CardTitle>
            <CardDescription>投稿記事のURL構造を設定します</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* URLプレフィックス設定 */}
            <FormField
              control={form.control}
              name="postUrlPrefixEnabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        /posts/ プレフィックス
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        URLに /posts/ を含める（推奨）
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            {/* プレフィックス無効時の警告 */}
            {!prefixEnabled && (
              <div className="rounded-md border border-warning/20 bg-warning/10 p-4">
                <p className="text-sm text-warning-foreground">
                  プレフィックスを無効にすると、投稿のスラッグがルートレベルで使用されます。
                  既存の静的ページ（about, contact
                  等）や予約パスと衝突しないよう注意してください。
                </p>
              </div>
            )}

            {/* URL構造選択 */}
            <FormField
              control={form.control}
              name="postPermalinkStructure"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL構造</FormLabel>
                  <FormControl>
                    <SelectionBox
                      options={PERMALINK_OPTIONS}
                      value={field.value}
                      onChange={(value) => {
                        if (isValidPostPermalinkStructure(value)) {
                          field.onChange(value);
                        }
                      }}
                      columns={1}
                      name="パーマリンク構造"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* プレビュー */}
            <div className="rounded-md bg-muted p-4">
              <FormLabel className="text-sm font-medium">プレビュー</FormLabel>
              <code className="mt-2 block text-sm font-mono">
                {getPreviewUrl()}
              </code>
            </div>

            {/* 注意事項 */}
            <div className="rounded-md border border-muted bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                予約済みパス（about, contact, news, spaces, admin
                など）と同名のスラッグは使用できません。
              </p>
            </div>

            {/* 保存ボタン */}
            <SubmitButton
              isPending={isPending}
              label="保存"
              disabled={!form.formState.isDirty}
            />
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
