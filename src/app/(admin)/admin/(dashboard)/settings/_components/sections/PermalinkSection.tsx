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
  };
};

// 記事詳細ルートは単一動的セグメント /blog/[slug] のみのため、選択できる構造は
// post_name（/blog/{slug}）に限る。date_name / category_name は多セグメント URL を
// 生成するが対応する catch-all ルートが無く、選ぶと全記事が 404 になっていたため撤去した。
const PERMALINK_OPTIONS: SelectionBoxOption[] = [
  {
    value: PostPermalinkStructure.post_name,
    label: "シンプル",
    description: "記事名のみのシンプルなURL（/blog/記事スラッグ）",
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
    },
  });

  const structure = useInputControl(fields.postPermalinkStructure);

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("パーマリンク設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  // 記事 URL は /blog/{slug} 固定（多セグメント permalink は非対応）。
  const getPreviewUrl = () => "/blog/article-title";

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>パーマリンク設定</CardTitle>
          <CardDescription>投稿記事のURL構造を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
