"use client";

/**
 * レビュー機能設定セクション（サイト全体 global gate）
 *
 * Multi-tenant template SaaS pattern: サイト全体のレビュー機能 ON/OFF を管理。
 * - Global OFF: 全スペースでレビュー非表示（per-space toggle に関わらず）
 * - Global ON: per-space `Space.reviewsEnabled` が効く（WordPress / Ghost precedence）
 */

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
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateReviewsGlobalSettings } from "@/admin/actions/settings";
import { reviewsGlobalSettingsSchema } from "@/admin/actions/settings/schemas/basic";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface ReviewsSectionProps {
  readonly settings: Serialized<SettingsData>;
}

export function ReviewsSection({ settings }: ReviewsSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    reviewsGlobalSettingsSchema,
    (data) => updateReviewsGlobalSettings(data),
    {
      defaultValues: {
        reviewsEnabledGlobal: settings.reviewsEnabledGlobal,
      },
      refresh: true,
      successMessage: "レビュー設定を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>レビュー機能</CardTitle>
            <CardDescription>
              サイト全体でレビューの表示・投稿を有効にするか設定します。オフにすると、スペース個別の設定に関わらず、全てのレビューが非表示になります。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="reviewsEnabledGlobal"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="font-medium">
                        レビュー機能を有効化
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        オフにすると公開ページの星評価・レビュー一覧・投稿フォームが全スペースで非表示になります
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-2">
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
