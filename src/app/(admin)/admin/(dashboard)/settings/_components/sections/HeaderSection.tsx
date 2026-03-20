"use client";

/**
 * ヘッダー設定セクション
 *
 * ヘッダーのスクロール動作と背景モードを設定
 */

import Link from "next/link";
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
  FormMessage,
  SelectionBox,
  SubmitButton,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateHeaderSettings } from "@/admin/actions/settings";
import { headerFormSchema } from "@/admin/actions/settings/schemas";
import type { SelectionBoxOption } from "@/admin/components/ui";
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  isValidHeaderScrollBehavior,
  isValidHeaderBackgroundMode,
  getValidHeaderScrollBehavior,
  getValidHeaderBackgroundMode,
} from "@/shared/lib/validations/enums";

// =============================================================================
// Constants
// =============================================================================

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

// =============================================================================
// Types
// =============================================================================

interface HeaderSectionProps {
  settings: {
    headerScrollBehavior: string;
    headerBackgroundMode: string;
  };
}

// =============================================================================
// Component
// =============================================================================

export function HeaderSection({ settings }: HeaderSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    headerFormSchema,
    (data) =>
      updateHeaderSettings({
        headerScrollBehavior: data.headerScrollBehavior,
        headerBackgroundMode: data.headerBackgroundMode,
      }),
    {
      defaultValues: {
        headerScrollBehavior: getValidHeaderScrollBehavior(
          settings.headerScrollBehavior,
        ),
        headerBackgroundMode: getValidHeaderBackgroundMode(
          settings.headerBackgroundMode,
        ),
      },
      refresh: true,
      successMessage: "ヘッダー設定を保存しました",
    },
  );

  const backgroundMode = useWatch({
    control: form.control,
    name: "headerBackgroundMode",
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>ヘッダー設定</CardTitle>
            <CardDescription>
              ヘッダーのスクロール時の動作と背景モードを設定します。
              メニュー項目は
              <Link
                href="/admin/settings/navigation"
                className="text-primary underline-offset-4 hover:underline"
              >
                ナビゲーション管理
              </Link>
              で編集できます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="headerBackgroundMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>背景モード</FormLabel>
                  <FormControl>
                    <SelectionBox
                      options={BACKGROUND_MODE_OPTIONS}
                      value={field.value}
                      onChange={(value) => {
                        if (isValidHeaderBackgroundMode(value)) {
                          field.onChange(value);
                        }
                      }}
                      columns={1}
                      name="ヘッダー背景モード"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="headerScrollBehavior"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>スクロール動作</FormLabel>
                  <FormControl>
                    <SelectionBox
                      options={SCROLL_BEHAVIOR_OPTIONS}
                      value={field.value}
                      onChange={(value) => {
                        if (isValidHeaderScrollBehavior(value)) {
                          field.onChange(value);
                        }
                      }}
                      columns={1}
                      name="ヘッダースクロール動作"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md border border-muted bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                {backgroundMode === HeaderBackgroundMode.transparent
                  ? "ヒーロー画像がヘッダー背後に広がります。テキストが見にくい場合は「不透明」に変更してください。"
                  : "予約導線を常時表示したい場合は「常時表示」がおすすめです。"}
              </p>
            </div>

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
