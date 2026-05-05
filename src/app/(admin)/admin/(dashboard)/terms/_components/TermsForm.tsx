"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { tryConvertHtmlStringToLexicalJsonString } from "@/admin/components/editor/lexical/html-to-lexical-json";
import {
  Button,
  Card,
  CardContent,
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
  Switch,
  SubmitButton,
} from "@/admin/components/ui";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { isMutationError } from "@/shared/lib/mutation-result";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import {
  TERMS_TYPE_LABELS,
  TERMS_TYPE_VALUES,
  termsFormSchema,
  type TermsFormInput,
} from "@/shared/lib/validations/terms";
import { createTerms, updateTerms } from "@/admin/actions/terms";

interface TermsFormProps {
  readonly mode: "create" | "edit";
  readonly initial?: Partial<TermsFormInput> & { readonly id?: string };
  /**
   * 規約タイプ別テンプレート HTML（Settings 値置換済み）。
   * 渡された場合、初回マウント時に Lexical EditorState JSON へ変換して
   * `contentJson` の初期値とする（client-side のみ実行、構造保持）。
   * `initial.contentJson` が優先。
   */
  readonly initialTemplateHtml?: string;
}

export function TermsForm({
  mode,
  initial,
  initialTemplateHtml,
}: TermsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // template HTML を Lexical JSON に変換。client-only (DOMParser 必要)。
  // useState lazy initializer で初回 1 回のみ実行。
  // key={typeValue} で remount される設計のため、type 切替時は再変換される。
  const [initialContentJson] = useState<string>(() => {
    if (typeof initial?.contentJson === "string") return initial.contentJson;
    if (initialTemplateHtml && typeof window !== "undefined") {
      const result =
        tryConvertHtmlStringToLexicalJsonString(initialTemplateHtml);
      if (result.ok) return result.json;
    }
    return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  });

  const form = useForm<TermsFormInput, unknown, TermsFormInput>({
    resolver: standardSchemaResolver(termsFormSchema),
    defaultValues: {
      type: initial?.type ?? "terms-of-use",
      slug: initial?.slug ?? "",
      title: initial?.title ?? "",
      contentJson: initialContentJson,
      isPublished: initial?.isPublished ?? false,
      requiredAtReservation: initial?.requiredAtReservation ?? false,
      requiredAtInquiry: initial?.requiredAtInquiry ?? false,
      requiredAtSignup: initial?.requiredAtSignup ?? false,
      showInFooter: initial?.showInFooter ?? true,
      footerOrder: initial?.footerOrder ?? 0,
    },
  });

  const contentJsonField = useController({
    control: form.control,
    name: "contentJson",
  });

  function onSubmit(data: TermsFormInput) {
    startTransition(async () => {
      try {
        const result =
          mode === "edit" && initial?.id
            ? await updateTerms(initial.id, data)
            : await createTerms(data);

        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success(
          mode === "edit" ? "規約を更新しました" : "規約を作成しました",
        );
        router.push("/admin/terms");
        router.refresh();
      } catch (error) {
        logger.error("規約保存エラー", { error: getErrorMessage(error) });
        toast.error("保存中にエラーが発生しました");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left column: メイン編集 */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>基本情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>タイトル</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={isPending} required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>タイプ</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TERMS_TYPE_VALUES.map((value) => (
                              <SelectItem key={value} value={value}>
                                {TERMS_TYPE_LABELS[value] ?? value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>スラッグ</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={isPending}
                            placeholder="terms-of-use"
                            required
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          URL: /terms/&lt;スラッグ&gt;
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>本文</CardTitle>
              </CardHeader>
              <CardContent>
                <LazyLexicalEditor
                  contentJson={
                    typeof contentJsonField.field.value === "string"
                      ? contentJsonField.field.value
                      : EMPTY_LEXICAL_EDITOR_STATE_JSON
                  }
                  onChange={contentJsonField.field.onChange}
                  disabled={isPending}
                  className={EDITOR_PROSE_CLASSES}
                  showToolbar
                />
                {form.formState.errors.contentJson && (
                  <p className="mt-2 text-sm text-destructive">
                    {form.formState.errors.contentJson.message}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: 公開設定 */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>公開設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="isPublished"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel>公開する</FormLabel>
                        <FormDescription className="text-xs">
                          公開時のみ /terms 配下に表示
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="requiredAtReservation"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel>予約時に同意必須</FormLabel>
                        <FormDescription className="text-xs">
                          予約フォームでチェックを必須化
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="requiredAtInquiry"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel>問い合わせ時に同意必須</FormLabel>
                        <FormDescription className="text-xs">
                          お問い合わせフォームでチェックを必須化
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="requiredAtSignup"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel>新規登録時に同意必須</FormLabel>
                        <FormDescription className="text-xs">
                          ソーシャルログイン初回登録でチェックを必須化
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="showInFooter"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel>フッターに表示</FormLabel>
                        <FormDescription className="text-xs">
                          公開ページのフッターにリンク
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="footerOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>表示順</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={999}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        小さい順に表示（フッター・一覧）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/terms")}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton
            isPending={isPending}
            label={mode === "edit" ? "更新" : "作成"}
          />
        </div>
      </form>
    </Form>
  );
}
