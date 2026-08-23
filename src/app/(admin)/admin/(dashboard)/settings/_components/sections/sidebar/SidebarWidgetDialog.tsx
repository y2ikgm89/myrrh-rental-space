"use client";

import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import type { z } from "zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import {
  customWidgetFormSchema,
  type CustomWidget,
  type CustomWidgetFormValues,
} from "@/shared/lib/validations/sidebar";

export interface SidebarWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingWidget: CustomWidget | null;
  onSubmit: (data: CustomWidgetFormValues) => void;
}

/**
 * サイドバーのカスタムウィジェット編集ダイアログ。
 *
 * **Server Action を呼ばない。** 値は親 (`SidebarSection`) の widgets state に
 * 積まれ、保存は設定フォーム全体の submit でまとめて行われる。よって
 * `action` prop も `dispatchWithoutFormReset` も要らない（React 19 の
 * form auto-reset は `action` prop に関数を渡したときだけ起きる）。
 *
 * conform に載せているのは検証と表示のため: 以前は `title` の必須判定が
 * 送信ボタンの `disabled` だけで**理由が文言として出ず**、`linkUrl` のエラーだけが
 * 手書きの state で表示されていた。schema は `customWidgetSchema` から `pick`
 * しているので、widget 側の規則とずれない。
 */
export function SidebarWidgetDialog({
  open,
  onOpenChange,
  editingWidget,
  onSubmit,
}: SidebarWidgetDialogProps) {
  const [form, fields] = useForm<z.input<typeof customWidgetFormSchema>>({
    // 編集対象が変わったら別フォーム扱いにして、前の値が残らないようにする
    id: editingWidget
      ? `sidebar-widget-${editingWidget.id}`
      : "sidebar-widget-new",
    constraint: getZodConstraint(customWidgetFormSchema),
    defaultValue: {
      title: editingWidget?.title ?? "",
      description: editingWidget?.description ?? "",
      linkUrl: editingWidget?.linkUrl ?? "",
      linkLabel: editingWidget?.linkLabel ?? "",
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: customWidgetFormSchema });
    },
    onSubmit(event, { submission }) {
      event.preventDefault();
      // conform は client 検証を通過した submit だけ渡してくるが、
      // `submission` は型上 optional なので明示的に確かめる
      if (submission?.status !== "success") return;
      onSubmit(submission.value);
      onOpenChange(false);
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const formErrors = form.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingWidget
              ? "カスタムウィジェットを編集"
              : "カスタムウィジェットを追加"}
          </DialogTitle>
        </DialogHeader>
        <form {...getFormProps(form)} className="space-y-4">
          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={fields.title.id}>
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              {...getInputProps(fields.title, { type: "text" })}
              placeholder="ウィジェットタイトル"
              maxLength={100}
            />
            {fields.title.errors && (
              <p
                id={fields.title.errorId}
                className="text-sm text-destructive"
                role="alert"
              >
                {fields.title.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.description.id}>説明</Label>
            <Textarea
              {...getInputProps(fields.description, { type: "text" })}
              placeholder="ウィジェットの説明（任意）"
              maxLength={500}
              rows={3}
            />
            {fields.description.errors && (
              <p
                id={fields.description.errorId}
                className="text-sm text-destructive"
                role="alert"
              >
                {fields.description.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.linkUrl.id}>リンクURL</Label>
            <Input
              {...getInputProps(fields.linkUrl, { type: "text" })}
              placeholder="/contact または https://..."
              maxLength={500}
            />
            {fields.linkUrl.errors && (
              <p
                id={fields.linkUrl.errorId}
                className="text-sm text-destructive"
                role="alert"
              >
                {fields.linkUrl.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.linkLabel.id}>リンクラベル</Label>
            <Input
              {...getInputProps(fields.linkLabel, { type: "text" })}
              placeholder="もっと見る"
              maxLength={100}
            />
            {fields.linkLabel.errors && (
              <p
                id={fields.linkLabel.errorId}
                className="text-sm text-destructive"
                role="alert"
              >
                {fields.linkLabel.errors.join(", ")}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={false}
              label={editingWidget ? "更新" : "追加"}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
