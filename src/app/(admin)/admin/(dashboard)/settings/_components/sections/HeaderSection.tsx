"use client";

/**
 * ヘッダー設定セクション (Phase 1 Task 5 conform 移行)
 *
 * ヘッダーのスクロール動作と背景モードを設定
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
import { updateHeaderSettings } from "@/admin/actions/settings";
import { headerFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  isValidHeaderScrollBehavior,
  isValidHeaderBackgroundMode,
} from "@/shared/lib/validations/enums/guards";
import {
  getValidHeaderScrollBehavior,
  getValidHeaderBackgroundMode,
} from "@/shared/lib/validations/enums/helpers";

const SCROLL_BEHAVIOR_OPTIONS: SelectionBoxOption[] = [
  {
    value: HeaderScrollBehavior.auto_hide,
    label: "自動非表示",
    description: "下スクロール150px蓄積で非表示、上スクロールで復帰",
  },
  {
    value: HeaderScrollBehavior.always_visible,
    label: "常時表示",
    description: "スクロールしてもヘッダーは常に表示（背景のみ変化）",
  },
  {
    value: HeaderScrollBehavior.hide_on_scroll,
    label: "スクロールで即非表示",
    description: "下スクロール開始で即座に非表示、上スクロールで復帰",
  },
];

const BACKGROUND_MODE_OPTIONS: SelectionBoxOption[] = [
  {
    value: HeaderBackgroundMode.solid,
    label: "不透明",
    description: "ヘッダーの下にコンテンツが配置される通常レイアウト",
  },
  {
    value: HeaderBackgroundMode.transparent,
    label: "透明",
    description: "ヒーロー画像がヘッダー背後に広がる透過レイアウト",
  },
];

interface HeaderSectionProps {
  settings: {
    headerScrollBehavior: string;
    headerBackgroundMode: string;
  };
}

export function HeaderSection({ settings }: HeaderSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateHeaderSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "header-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: headerFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      headerScrollBehavior: getValidHeaderScrollBehavior(
        settings.headerScrollBehavior,
      ),
      headerBackgroundMode: getValidHeaderBackgroundMode(
        settings.headerBackgroundMode,
      ),
    },
  });

  const scrollBehavior = useInputControl(fields.headerScrollBehavior);
  const backgroundMode = useInputControl(fields.headerBackgroundMode);

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("ヘッダー設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>ヘッダー設定</CardTitle>
          <CardDescription>
            ヘッダーのスクロール時の動作と背景モードを設定します。メニュー項目は「ナビゲーション」タブで編集できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor={fields.headerBackgroundMode.id}
            >
              背景モード
            </label>
            <SelectionBox
              options={BACKGROUND_MODE_OPTIONS}
              value={backgroundMode.value ?? ""}
              onChange={(value) => {
                if (isValidHeaderBackgroundMode(value)) {
                  backgroundMode.change(value);
                }
              }}
              columns={1}
              name="ヘッダー背景モード"
            />
            <input
              type="hidden"
              name={fields.headerBackgroundMode.name}
              value={backgroundMode.value ?? ""}
            />
            {fields.headerBackgroundMode.errors &&
              fields.headerBackgroundMode.errors.length > 0 && (
                <p
                  id={fields.headerBackgroundMode.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.headerBackgroundMode.errors.join(", ")}
                </p>
              )}
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor={fields.headerScrollBehavior.id}
            >
              スクロール動作
            </label>
            <SelectionBox
              options={SCROLL_BEHAVIOR_OPTIONS}
              value={scrollBehavior.value ?? ""}
              onChange={(value) => {
                if (isValidHeaderScrollBehavior(value)) {
                  scrollBehavior.change(value);
                }
              }}
              columns={1}
              name="ヘッダースクロール動作"
            />
            <input
              type="hidden"
              name={fields.headerScrollBehavior.name}
              value={scrollBehavior.value ?? ""}
            />
            {fields.headerScrollBehavior.errors &&
              fields.headerScrollBehavior.errors.length > 0 && (
                <p
                  id={fields.headerScrollBehavior.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.headerScrollBehavior.errors.join(", ")}
                </p>
              )}
          </div>

          <div className="rounded-md border border-muted bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              {backgroundMode.value === HeaderBackgroundMode.transparent
                ? "ヒーロー画像がヘッダー背後に広がります。テキストが見にくい場合は「不透明」に変更してください。"
                : "予約導線を常時表示したい場合は「常時表示」がおすすめです。"}
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
