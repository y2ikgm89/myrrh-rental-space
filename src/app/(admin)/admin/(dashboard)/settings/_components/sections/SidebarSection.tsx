"use client";

/**
 * サイドバー設定セクション
 *
 * サイドバーの有効/無効、ウィジェット設定、表示件数設定
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
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/admin/components/ui/accordion";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateSidebarSettings } from "@/admin/actions/settings";
import { sidebarFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import {
  DEFAULT_SIDEBAR_WIDGETS,
  parseSidebarWidgets,
} from "@/shared/lib/validations/sidebar";

// =============================================================================
// Types
// =============================================================================

interface SidebarSectionProps {
  settings: Serialized<SettingsData>;
}

// =============================================================================
// Component
// =============================================================================

export function SidebarSection({ settings }: SidebarSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    sidebarFormSchema,
    (data) =>
      updateSidebarSettings({
        sidebarEnabled: data.sidebarEnabled,
        sidebarWidgets: data.sidebarWidgets,
        sidebarRecentCount: data.sidebarRecentCount,
        sidebarPopularCount: data.sidebarPopularCount,
      }),
    {
      defaultValues: {
        sidebarEnabled: settings.sidebarEnabled ?? true,
        sidebarWidgets: parseSidebarWidgets(settings.sidebarWidgets),
        sidebarRecentCount: settings.sidebarRecentCount ?? 5,
        sidebarPopularCount: settings.sidebarPopularCount ?? 5,
      },
      refresh: true,
      successMessage: "サイドバー設定を保存しました",
    },
  );

  const sidebarEnabled = useWatch({
    control: form.control,
    name: "sidebarEnabled",
  });

  const widgets = useWatch({
    control: form.control,
    name: "sidebarWidgets",
  });

  const isWidgetEnabled = (type: string) =>
    widgets?.find((w) => w.type === type)?.enabled ?? false;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>サイドバー設定</CardTitle>
            <CardDescription>
              ブログページのサイドバー表示とウィジェット設定を行います
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* サイドバー全体の有効/無効 */}
            <FormField
              control={form.control}
              name="sidebarEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>サイドバーを表示する</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      ブログページでサイドバーを表示します
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* ウィジェット設定 */}
            {sidebarEnabled && (
              <>
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">ウィジェット設定</h4>

                  {DEFAULT_SIDEBAR_WIDGETS.map((widget, index) => {
                    const labels: Record<
                      string,
                      { label: string; desc: string }
                    > = {
                      search: {
                        label: "検索ウィジェット",
                        desc: "記事検索フォームを表示します",
                      },
                      recent: {
                        label: "新着記事ウィジェット",
                        desc: "最新の記事一覧を表示します",
                      },
                      popular: {
                        label: "人気記事ウィジェット",
                        desc: "閲覧数の多い記事一覧を表示します",
                      },
                      categories: {
                        label: "カテゴリーウィジェット",
                        desc: "カテゴリー一覧を表示します",
                      },
                      tags: {
                        label: "タグウィジェット",
                        desc: "タグクラウドを表示します",
                      },
                    };
                    const meta = labels[widget.type];
                    if (!meta) return null;

                    const fieldIndex = form
                      .getValues("sidebarWidgets")
                      .findIndex((w) => w.type === widget.type);
                    const idx = fieldIndex >= 0 ? fieldIndex : index;

                    return (
                      <FormField
                        key={widget.type}
                        control={form.control}
                        name={`sidebarWidgets.${idx}.enabled`}
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel>{meta.label}</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                {meta.desc}
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isPending}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    );
                  })}
                </div>

                {/* 表示件数設定 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">表示件数設定</h4>

                  {isWidgetEnabled("recent") && (
                    <FormField
                      control={form.control}
                      name="sidebarRecentCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>新着記事の表示件数</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="20"
                              value={field.value}
                              onChange={(e) =>
                                field.onChange(
                                  parseInt(e.target.value, 10) || 5,
                                )
                              }
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormDescription>
                            1〜20件の範囲で指定してください
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {isWidgetEnabled("popular") && (
                    <FormField
                      control={form.control}
                      name="sidebarPopularCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>人気記事の表示件数</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="20"
                              value={field.value}
                              onChange={(e) =>
                                field.onChange(
                                  parseInt(e.target.value, 10) || 5,
                                )
                              }
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormDescription>
                            1〜20件の範囲で指定してください
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </>
            )}

            {/* 保存ボタン */}
            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="サイドバー設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>

            {/* ヒント */}
            <Accordion type="single" collapsible>
              <AccordionItem
                value="hints"
                className="rounded-lg border bg-muted/50 px-4 border-b last:border-b"
              >
                <AccordionTrigger className="text-sm">ヒント</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                    <li>
                      サイドバーは記事一覧ページと記事詳細ページで表示されます
                    </li>
                    <li>モバイル表示では自動的に非表示になります</li>
                    <li>各ウィジェットは個別にオン/オフできます</li>
                    <li>表示件数は1〜20件の範囲で設定できます</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
