"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { PortableTextInlineEditor } from "@/admin/components/portable-text/inline-editor/PortableTextInlineEditor";
import {
  createAnnouncementBarAction,
  updateAnnouncementBarAction,
} from "@/admin/actions/announcement-bar";
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";
import type { PortableTextSpan } from "@/shared/lib/portable-text";
import type { AnnouncementBarData } from "@/shared/domain/settings/announcement-bar";
import type { Serialized } from "@/shared/lib/serialize";
import { barFormSchema } from "./bar-form-schema";
import type { DeleteDialogProps } from "./types";

// =============================================================================
// BarFormDialog (Phase 1 Task 8.1 — conform Variant A: mount-on-open + bind)
// =============================================================================

type BarFormDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingBar: Serialized<AnnouncementBarData> | null;
  readonly onSuccess: () => Promise<void>;
};

export function BarFormDialog({
  open,
  onOpenChange,
  editingBar,
  onSuccess,
}: BarFormDialogProps) {
  const isEdit = editingBar !== null;
  const boundAction = isEdit
    ? updateAnnouncementBarAction.bind(null, editingBar.id)
    : createAnnouncementBarAction;

  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  // PortableTextInlineEditor の value/onChange は local React state で管理し、
  // hidden input に JSON.stringify した文字列を送信。schema (messageSchema) が
  // server-side で JSON.parse + portableTextSpan validate を行う (Pattern B)。
  const [messageSpans, setMessageSpans] = useState<PortableTextSpan[]>(
    editingBar?.message ?? [],
  );

  const [form, fields] = useForm({
    id: isEdit
      ? `announcement-bar-edit-${editingBar.id}`
      : "announcement-bar-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: barFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      linkUrl: editingBar?.linkUrl ?? "",
      linkText: editingBar?.linkText ?? "",
      isActive: editingBar?.isActive === false ? "" : "on",
      priority: String(editingBar?.priority ?? 0),
      startAt: editingBar?.startAt
        ? formatDateTimeLocalInJst(editingBar.startAt)
        : "",
      endAt: editingBar?.endAt
        ? formatDateTimeLocalInJst(editingBar.endAt)
        : "",
    },
  });

  // success → close は副作用 (toast + refresh) と統合して useEffect で処理。
  // Dialog 内 mount-on-open のため次回 open 時は fresh init される (state preservation 不要)。
  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit ? "お知らせバーを更新しました" : "お知らせバーを作成しました",
      );
      onOpenChange(false);
      void onSuccess();
    }
  }, [lastResult, isEdit, onOpenChange, onSuccess]);

  // Switch state は uncontrolled だと boolean 同期が崩れるため local state + hidden input
  const [isActive, setIsActive] = useState<boolean>(
    editingBar?.isActive !== false,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form {...getFormProps(form)} action={action}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "お知らせバーを編集" : "お知らせバーを作成"}
            </DialogTitle>
            <DialogDescription>
              サイト上部に表示するお知らせバーの内容を設定します
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Message (PortableText) */}
            <div className="space-y-2">
              <Label htmlFor="announcement-bar-message">メッセージ *</Label>
              <PortableTextInlineEditor
                id="announcement-bar-message"
                aria-label="お知らせメッセージ"
                value={messageSpans}
                onChange={setMessageSpans}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.message.name}
                value={JSON.stringify(messageSpans)}
              />
              <p className="text-xs text-muted-foreground">
                テキスト入力中に <code>/icon</code>{" "}
                と打つとアイコンを挿入できます。
              </p>
              {fields.message.errors && (
                <p
                  id={fields.message.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.message.errors.join(", ")}
                </p>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor={fields.priority.id}>優先度</Label>
              <Input
                {...getInputProps(fields.priority, { type: "number" })}
                min={0}
                max={100}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                数字が大きいほど優先的に表示
              </p>
              {fields.priority.errors && (
                <p
                  id={fields.priority.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.priority.errors.join(", ")}
                </p>
              )}
            </div>

            {/* Link */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.linkUrl.id}>リンクURL</Label>
                <Input
                  {...getInputProps(fields.linkUrl, { type: "url" })}
                  placeholder="https://example.com"
                  disabled={isPending}
                />
                {fields.linkUrl.errors && (
                  <p
                    id={fields.linkUrl.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.linkUrl.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.linkText.id}>リンクテキスト</Label>
                <Input
                  {...getInputProps(fields.linkText, { type: "text" })}
                  placeholder="詳しくはこちら"
                  disabled={isPending}
                />
                {fields.linkText.errors && (
                  <p
                    id={fields.linkText.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.linkText.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.startAt.id}>表示開始日時</Label>
                <Input
                  {...getInputProps(fields.startAt, { type: "datetime-local" })}
                  disabled={isPending}
                />
                {fields.startAt.errors && (
                  <p
                    id={fields.startAt.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.startAt.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.endAt.id}>表示終了日時</Label>
                <Input
                  {...getInputProps(fields.endAt, { type: "datetime-local" })}
                  disabled={isPending}
                />
                {fields.endAt.errors && (
                  <p
                    id={fields.endAt.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.endAt.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Active */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label
                  htmlFor="announcement-bar-isActive"
                  className="text-base"
                >
                  有効にする
                </Label>
                <p className="text-sm text-muted-foreground">
                  オフにするとサイトに表示されません
                </p>
              </div>
              <Switch
                id="announcement-bar-isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.isActive.name}
                value={isActive ? "on" : ""}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label={isEdit ? "更新" : "作成"}
              pendingLabel="保存中..."
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// DeleteDialog (form なし、単独 action 経由)
// =============================================================================

export function DeleteDialog({
  isOpen,
  onOpenChange,
  isPending,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>お知らせバーを削除しますか？</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。本当に削除してもよろしいですか？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "削除中..." : "削除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
