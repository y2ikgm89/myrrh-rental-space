"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { tryConvertHtmlStringToLexicalJsonString } from "@/admin/components/editor/lexical/html-to-lexical-json";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
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
import {
  TERMS_TYPE_LABELS,
  TERMS_TYPE_VALUES,
  type TermsFormInput,
} from "@/shared/lib/validations/terms";
import { createTermsAction, updateTermsAction } from "@/admin/actions/terms";
import { termsFormSchema } from "./terms-form-schema";

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

  // template HTML を Lexical JSON に変換。client-only (DOMParser 必要)。
  // useState lazy initializer で初回 1 回のみ実行。
  // key={typeValue} で remount される設計のため、type 切替時は再変換される。
  const [contentJson, setContentJson] = useState<string>(() => {
    if (typeof initial?.contentJson === "string") return initial.contentJson;
    if (initialTemplateHtml && typeof window !== "undefined") {
      const result =
        tryConvertHtmlStringToLexicalJsonString(initialTemplateHtml);
      if (result.ok) return result.json;
    }
    return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  });

  // Switch / Select state (controlled, hidden input で送信)
  const initialType = initial?.type ?? "terms-of-use";
  const [type, setType] = useState<string>(initialType);
  const [isPublished, setIsPublished] = useState<boolean>(
    initial?.isPublished ?? false,
  );
  const [requiredAtReservation, setRequiredAtReservation] = useState<boolean>(
    initial?.requiredAtReservation ?? false,
  );
  const [requiredAtInquiry, setRequiredAtInquiry] = useState<boolean>(
    initial?.requiredAtInquiry ?? false,
  );
  const [requiredAtSignup, setRequiredAtSignup] = useState<boolean>(
    initial?.requiredAtSignup ?? false,
  );
  const [showInFooter, setShowInFooter] = useState<boolean>(
    initial?.showInFooter ?? true,
  );

  // contentHtml: contentJson から毎 render で派生計算 (React Compiler が自動メモ化)。
  // hidden input に直接 value として渡すことで form submit 時に server-side で確定値を受信。
  const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);

  const isEdit = mode === "edit" && Boolean(initial?.id);
  const boundAction =
    isEdit && initial?.id
      ? updateTermsAction.bind(null, initial.id)
      : createTermsAction;

  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `terms-edit-${initial?.id ?? ""}` : "terms-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: termsFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      slug: initial?.slug ?? "",
      title: initial?.title ?? "",
    },
  });

  // success → /admin/terms へ遷移 (副作用は useEffect)
  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(isEdit ? "規約を更新しました" : "規約を作成しました");
      router.push("/admin/terms");
      router.refresh();
    }
  }, [lastResult, isEdit, router]);

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left column: メイン編集 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor={fields.title.id}>タイトル</Label>
                <Input
                  {...getInputProps(fields.title, { type: "text" })}
                  disabled={isPending}
                  required
                />
                {fields.title.errors && (
                  <p
                    id={fields.title.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.title.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Type */}
                <div className="space-y-2">
                  <Label htmlFor="terms-type">タイプ</Label>
                  <Select
                    value={type}
                    onValueChange={setType}
                    disabled={isPending}
                  >
                    <SelectTrigger id="terms-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMS_TYPE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {TERMS_TYPE_LABELS[value] ?? value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name={fields.type.name} value={type} />
                  {fields.type.errors && (
                    <p
                      id={fields.type.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.type.errors.join(", ")}
                    </p>
                  )}
                </div>

                {/* Slug */}
                <div className="space-y-2">
                  <Label htmlFor={fields.slug.id}>スラッグ</Label>
                  <Input
                    {...getInputProps(fields.slug, { type: "text" })}
                    disabled={isPending}
                    placeholder="terms-of-use"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    URL: /terms/&lt;スラッグ&gt;
                  </p>
                  {fields.slug.errors && (
                    <p
                      id={fields.slug.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.slug.errors.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>本文</CardTitle>
            </CardHeader>
            <CardContent>
              <LazyLexicalEditor
                contentJson={contentJson}
                onChange={setContentJson}
                disabled={isPending}
                className={EDITOR_PROSE_CLASSES}
                showToolbar
              />
              <input
                type="hidden"
                name={fields.contentJson.name}
                value={contentJson}
              />
              <input
                type="hidden"
                name={fields.contentHtml.name}
                value={contentHtml}
              />
              {fields.contentJson.errors && (
                <p className="mt-2 text-sm text-destructive">
                  {fields.contentJson.errors.join(", ")}
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
              {/* isPublished */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="terms-isPublished">公開する</Label>
                  <p className="text-xs text-muted-foreground">
                    公開時のみ /terms 配下に表示
                  </p>
                </div>
                <Switch
                  id="terms-isPublished"
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                  disabled={isPending}
                />
                <input
                  type="hidden"
                  name={fields.isPublished.name}
                  value={isPublished ? "on" : ""}
                />
              </div>

              {/* requiredAtReservation */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="terms-requiredAtReservation">
                    予約時に同意必須
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    予約フォームでチェックを必須化
                  </p>
                </div>
                <Switch
                  id="terms-requiredAtReservation"
                  checked={requiredAtReservation}
                  onCheckedChange={setRequiredAtReservation}
                  disabled={isPending}
                />
                <input
                  type="hidden"
                  name={fields.requiredAtReservation.name}
                  value={requiredAtReservation ? "on" : ""}
                />
              </div>

              {/* requiredAtInquiry */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="terms-requiredAtInquiry">
                    問い合わせ時に同意必須
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    お問い合わせフォームでチェックを必須化
                  </p>
                </div>
                <Switch
                  id="terms-requiredAtInquiry"
                  checked={requiredAtInquiry}
                  onCheckedChange={setRequiredAtInquiry}
                  disabled={isPending}
                />
                <input
                  type="hidden"
                  name={fields.requiredAtInquiry.name}
                  value={requiredAtInquiry ? "on" : ""}
                />
              </div>

              {/* requiredAtSignup */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="terms-requiredAtSignup">
                    新規登録時に同意必須
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    ソーシャルログイン初回登録でチェックを必須化
                  </p>
                </div>
                <Switch
                  id="terms-requiredAtSignup"
                  checked={requiredAtSignup}
                  onCheckedChange={setRequiredAtSignup}
                  disabled={isPending}
                />
                <input
                  type="hidden"
                  name={fields.requiredAtSignup.name}
                  value={requiredAtSignup ? "on" : ""}
                />
              </div>

              {/* showInFooter */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="terms-showInFooter">フッターに表示</Label>
                  <p className="text-xs text-muted-foreground">
                    公開ページのフッターにリンク
                  </p>
                </div>
                <Switch
                  id="terms-showInFooter"
                  checked={showInFooter}
                  onCheckedChange={setShowInFooter}
                  disabled={isPending}
                />
                <input
                  type="hidden"
                  name={fields.showInFooter.name}
                  value={showInFooter ? "on" : ""}
                />
              </div>
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
        <SubmitButton isPending={isPending} label={isEdit ? "更新" : "作成"} />
      </div>
    </form>
  );
}
