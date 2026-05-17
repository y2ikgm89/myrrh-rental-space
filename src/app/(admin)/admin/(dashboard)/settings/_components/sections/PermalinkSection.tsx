"use client";

/**
 * パーマリンク設定セクション
 *
 * 投稿記事のURL構造とプレフィックス表示を設定
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelectionBox,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import type { SelectionBoxOption } from "@/admin/components/ui";
import { updatePermalinkSettings } from "@/admin/actions/settings";
import { permalinkFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import { PostPermalinkStructure } from "@/shared/lib/validations/enums/prisma-types";
import { isValidPostPermalinkStructure } from "@/shared/lib/validations/enums/guards";
import { getValidPostPermalinkStructure } from "@/shared/lib/validations/enums/helpers";

type PermalinkSectionProps = {
  settings: {
    postPermalinkStructure: PostPermalinkStructure | null;
    postUrlPrefixEnabled: boolean;
  };
};

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

export function PermalinkSection({ settings }: PermalinkSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updatePermalinkSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "permalink-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: permalinkFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      postPermalinkStructure: getValidPostPermalinkStructure(
        settings.postPermalinkStructure,
      ),
      postUrlPrefixEnabled: settings.postUrlPrefixEnabled ? "on" : "",
    },
  });

  const structure = useInputControl(fields.postPermalinkStructure);
  const prefixEnabled = useInputControl(fields.postUrlPrefixEnabled);
  const isPrefixOn = prefixEnabled.value === "on";

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("パーマリンク設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const getPreviewUrl = () => {
    const prefix = isPrefixOn ? "/posts" : "";
    switch (structure.value) {
      case PostPermalinkStructure.date_name:
        return `${prefix}/2026/01/article-title`;
      case PostPermalinkStructure.category_name:
        return `${prefix}/technology/article-title`;
      case PostPermalinkStructure.post_name:
      default:
        return `${prefix}/article-title`;
    }
  };

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>パーマリンク設定</CardTitle>
          <CardDescription>投稿記事のURL構造を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <label
                className="text-base font-medium"
                htmlFor={fields.postUrlPrefixEnabled.id}
              >
                /posts/ プレフィックス
              </label>
              <p className="text-sm text-muted-foreground">
                URLに /posts/ を含める（推奨）
              </p>
            </div>
            <Switch
              id={fields.postUrlPrefixEnabled.id}
              checked={isPrefixOn}
              onCheckedChange={(checked) =>
                prefixEnabled.change(checked ? "on" : "")
              }
              onBlur={prefixEnabled.blur}
              disabled={isPending}
            />
            <input
              type="hidden"
              name={fields.postUrlPrefixEnabled.name}
              value={isPrefixOn ? "on" : ""}
            />
          </div>

          {!isPrefixOn && (
            <div className="rounded-md border border-warning/20 bg-warning/10 p-4">
              <p className="text-sm text-warning-foreground">
                プレフィックスを無効にすると、投稿のスラッグがルートレベルで使用されます。
                既存の静的ページ（about, contact
                等）や予約パスと衝突しないよう注意してください。
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor={fields.postPermalinkStructure.id}
            >
              URL構造
            </label>
            <SelectionBox
              options={PERMALINK_OPTIONS}
              value={structure.value ?? ""}
              onChange={(value) => {
                if (isValidPostPermalinkStructure(value)) {
                  structure.change(value);
                }
              }}
              columns={1}
              name="パーマリンク構造"
            />
            <input
              type="hidden"
              name={fields.postPermalinkStructure.name}
              value={structure.value ?? ""}
            />
          </div>

          <div className="rounded-md bg-muted p-4">
            <p className="text-sm font-medium">プレビュー</p>
            <code className="mt-2 block text-sm font-mono">
              {getPreviewUrl()}
            </code>
          </div>

          <div className="rounded-md border border-muted bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              予約済みパス（about, contact, news, spaces, admin
              など）と同名のスラッグは使用できません。
            </p>
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
