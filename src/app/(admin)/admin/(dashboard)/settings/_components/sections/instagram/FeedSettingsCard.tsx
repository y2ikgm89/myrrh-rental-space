"use client";

/**
 * Instagram フィード表示設定 — Phase 1 Task 6 conform 移行
 *
 * `useFormAction` (RHF + shadcn Form/FormField) → `useActionState` + `useForm`
 * (@conform-to/react) clean break 移行。フィード有効化 (Switch) /
 * レイアウト (SelectionBox) / 列数・表示件数 (number) / キャプション・もっと見る
 * (Switch) を 1 保存単位で扱う。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconAperture } from "@tabler/icons-react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SelectionBox,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { updateInstagramSettings } from "@/admin/actions/instagram";
import type { InstagramConfig } from "@/shared/domain/instagram/types";
import { instagramFeedFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { InstagramFeedLayout } from "@/shared/lib/validations/enums/prisma-types";
import { isValidInstagramFeedLayout } from "@/shared/lib/validations/enums/guards";

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

interface FeedSettingsCardProps {
  config: InstagramConfig;
  parentIsPending: boolean;
}

export function FeedSettingsCard({
  config,
  parentIsPending,
}: FeedSettingsCardProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateInstagramSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "instagram-feed-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: instagramFeedFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      feedEnabled: config.feedEnabled ? "on" : "",
      feedLayout: config.feedLayout,
      feedColumns: String(config.feedColumns),
      feedMaxItems: String(config.feedMaxItems),
      showCaption: config.showCaption ? "on" : "",
      showViewAll: config.showViewAll ? "on" : "",
    },
  });

  const feedEnabledControl = useInputControl(fields.feedEnabled);
  const feedLayoutControl = useInputControl(fields.feedLayout);
  const showCaptionControl = useInputControl(fields.showCaption);
  const showViewAllControl = useInputControl(fields.showViewAll);

  const feedEnabled = feedEnabledControl.value === "on";
  const feedLayout = feedLayoutControl.value ?? config.feedLayout;
  const showCaption = showCaptionControl.value === "on";
  const showViewAll = showViewAllControl.value === "on";

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("Instagram設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formIsPending = isPending || parentIsPending;
  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <input
        type="hidden"
        name={fields.feedEnabled.name}
        value={feedEnabledControl.value ?? ""}
      />
      <input type="hidden" name={fields.feedLayout.name} value={feedLayout} />
      <input
        type="hidden"
        name={fields.showCaption.name}
        value={showCaptionControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.showViewAll.name}
        value={showViewAllControl.value ?? ""}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconAperture className="h-5 w-5" aria-hidden="true" />
            フィード表示設定
          </CardTitle>
          <CardDescription>
            ホームページや固定ページでのInstagram投稿の表示設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* フィード有効化 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={fields.feedEnabled.id}>フィードを有効化</Label>
              <p className="text-xs text-muted-foreground">
                ホームページにInstagramフィードを表示します
              </p>
            </div>
            <Switch
              id={fields.feedEnabled.id}
              checked={feedEnabled}
              onCheckedChange={(checked) =>
                feedEnabledControl.change(checked ? "on" : "")
              }
              disabled={formIsPending}
            />
          </div>

          {/* レイアウト選択 */}
          <div className="space-y-2">
            <Label htmlFor={fields.feedLayout.id}>レイアウト</Label>
            <SelectionBox
              options={LAYOUT_OPTIONS}
              value={feedLayout}
              onChange={(value) => {
                if (isValidInstagramFeedLayout(value)) {
                  feedLayoutControl.change(value);
                }
              }}
              columns={3}
              disabled={formIsPending || !feedEnabled}
              name="feed-layout"
            />
            {fields.feedLayout.errors && (
              <p
                id={fields.feedLayout.errorId}
                className="text-sm text-destructive"
              >
                {fields.feedLayout.errors.join(", ")}
              </p>
            )}
          </div>

          {/* 列数 */}
          <div className="space-y-2">
            <Label htmlFor={fields.feedColumns.id}>列数</Label>
            <Input
              {...getInputProps(fields.feedColumns, { type: "number" })}
              min={2}
              max={6}
              disabled={formIsPending || !feedEnabled}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">2〜6の範囲で指定</p>
            {fields.feedColumns.errors && (
              <p
                id={fields.feedColumns.errorId}
                className="text-sm text-destructive"
              >
                {fields.feedColumns.errors.join(", ")}
              </p>
            )}
          </div>

          {/* 表示件数 */}
          <div className="space-y-2">
            <Label htmlFor={fields.feedMaxItems.id}>表示件数</Label>
            <Input
              {...getInputProps(fields.feedMaxItems, { type: "number" })}
              min={1}
              max={24}
              disabled={formIsPending || !feedEnabled}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">1〜24の範囲で指定</p>
            {fields.feedMaxItems.errors && (
              <p
                id={fields.feedMaxItems.errorId}
                className="text-sm text-destructive"
              >
                {fields.feedMaxItems.errors.join(", ")}
              </p>
            )}
          </div>

          {/* キャプション表示 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={fields.showCaption.id}>キャプションを表示</Label>
              <p className="text-xs text-muted-foreground">
                投稿のキャプションを表示します
              </p>
            </div>
            <Switch
              id={fields.showCaption.id}
              checked={showCaption}
              onCheckedChange={(checked) =>
                showCaptionControl.change(checked ? "on" : "")
              }
              disabled={formIsPending || !feedEnabled}
            />
          </div>

          {/* もっと見るリンク */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={fields.showViewAll.id}>
                「もっと見る」リンク
              </Label>
              <p className="text-xs text-muted-foreground">
                Instagramプロフィールへのリンクを表示します
              </p>
            </div>
            <Switch
              id={fields.showViewAll.id}
              checked={showViewAll}
              onCheckedChange={(checked) =>
                showViewAllControl.change(checked ? "on" : "")
              }
              disabled={formIsPending || !feedEnabled}
            />
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          {/* 保存ボタン */}
          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
