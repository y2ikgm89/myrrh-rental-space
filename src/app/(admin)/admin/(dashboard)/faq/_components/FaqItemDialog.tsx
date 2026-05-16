"use client";

/**
 * FaqItemDialog — Phase 1 Task 6 conform 移行 (Variant B canonical)
 *
 * 質問の作成・編集を Dialog で行う共用コンポーネント。parent component
 * (`FaqCategoryDetailView`) が `editingItem` + `open` state を保持し、本 Dialog
 * に `open` / `onOpenChange` を渡す controlled パターン (`dialogs.md` Variant B)。
 *
 * - parent が `item={undefined}` で create、`item={item}` で edit を選択
 * - `useActionState` を本 Dialog 内で持ち、success 検知 → `onOpenChange(false)` は
 *   render 中 sync (`Adjusting State During Render` 公式パターン、`previousLastResult`
 *   比較)、副作用 (`toast` / `router.refresh`) は useEffect で分離
 * - create / edit は別 sub-component に分離し、それぞれ独立 `useActionState` を持つ
 *   (item id 差分による action ターゲット切替を React の component 同一性で識別)
 *
 * カテゴリは親から固定 (`categoryId` prop)、bulk move Dialog で変更する設計のため
 * Select は本 Dialog に置かない。`categoryId` は hidden input で送信する。
 *
 * Radix Dialog controlled パターン準拠:
 * https://www.radix-ui.com/primitives/docs/components/dialog
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubmissionResult } from "@conform-to/react";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { createFaqItem, updateFaqItem } from "@/admin/actions/faq";
import { faqItemFormSchema } from "@/admin/lib/validations/faq";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";

type FaqItemDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 所属カテゴリ ID — create / edit どちらも親から注入 */
  readonly categoryId: string;
  /** edit モード時の既存データ — undefined なら create mode */
  readonly item?: FaqItemWithCategory;
};

export function FaqItemDialog(props: FaqItemDialogProps) {
  if (props.item) {
    return <FaqItemEditDialog {...props} item={props.item} />;
  }
  return <FaqItemCreateDialog {...props} />;
}

// =============================================================================
// Create
// =============================================================================

type CreateProps = Omit<FaqItemDialogProps, "item">;

function FaqItemCreateDialog({ open, onOpenChange, categoryId }: CreateProps) {
  const router = useRouter();
  const [lastResult, formAction, isPending] = useActionState(
    createFaqItem,
    undefined,
  );

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → Dialog close (Adjusting State During Render)
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      onOpenChange(false);
    }
  }

  useEffect(() => {
    if (isSuccess) {
      toast.success("質問を作成しました");
      router.refresh();
    }
  }, [isSuccess, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>質問を追加</DialogTitle>
          <DialogDescription>
            このカテゴリに新しい質問を追加します
          </DialogDescription>
        </DialogHeader>
        <FaqItemFormBody
          formId="faq-item-create-form"
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          defaultValue={{
            categoryId,
            question: "",
            answer: "",
            order: "0",
            isPublished: "on",
          }}
        />
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
            form="faq-item-create-form"
            isPending={isPending}
            label="作成"
            pendingLabel="作成中..."
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Edit
// =============================================================================

type EditProps = Omit<FaqItemDialogProps, "item"> & {
  readonly item: FaqItemWithCategory;
};

function FaqItemEditDialog({ open, onOpenChange, item }: EditProps) {
  const router = useRouter();
  const boundAction = updateFaqItem.bind(null, item.id);
  const [lastResult, formAction, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const isSuccess = lastResult?.initialValue === null;

  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      onOpenChange(false);
    }
  }

  useEffect(() => {
    if (isSuccess) {
      toast.success("質問を更新しました");
      router.refresh();
    }
  }, [isSuccess, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>質問を編集</DialogTitle>
          <DialogDescription>質問と回答を編集します</DialogDescription>
        </DialogHeader>
        <FaqItemFormBody
          formId={`faq-item-edit-form-${item.id}`}
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          defaultValue={{
            categoryId: item.categoryId,
            question: item.question,
            answer: item.answer,
            order: String(item.order),
            isPublished: item.isPublished ? "on" : "",
          }}
        />
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
            form={`faq-item-edit-form-${item.id}`}
            isPending={isPending}
            label="更新"
            pendingLabel="更新中..."
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Form body (shared)
// =============================================================================

type FormBodyProps = {
  readonly formId: string;
  readonly isPending: boolean;
  readonly lastResult: SubmissionResult | undefined;
  readonly formAction: (formData: FormData) => void;
  readonly defaultValue: {
    categoryId: string;
    question: string;
    answer: string;
    order: string;
    isPublished: string;
  };
};

function FaqItemFormBody({
  formId,
  isPending,
  lastResult,
  formAction,
  defaultValue,
}: FormBodyProps) {
  const [form, fields] = useForm({
    id: formId,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: faqItemFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue,
  });

  const isPublishedControl = useInputControl(fields.isPublished);
  const isPublished = isPublishedControl.value === "on";

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      {/* categoryId は親から固定 */}
      <input
        type="hidden"
        name={fields.categoryId.name}
        value={defaultValue.categoryId}
      />
      <input
        type="hidden"
        name={fields.isPublished.name}
        value={isPublishedControl.value ?? ""}
      />

      <div className="space-y-2">
        <Label htmlFor={fields.question.id}>質問 *</Label>
        <Input
          {...getInputProps(fields.question, { type: "text" })}
          placeholder="例: 予約はいつまでキャンセルできますか？"
          disabled={isPending}
        />
        {fields.question.errors && (
          <p id={fields.question.errorId} className="text-xs text-destructive">
            {fields.question.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.answer.id}>回答 *</Label>
        <Textarea
          {...getTextareaProps(fields.answer)}
          placeholder="回答を入力してください。改行は公開ページでも保持されます。"
          rows={8}
          disabled={isPending}
        />
        {fields.answer.errors && (
          <p id={fields.answer.errorId} className="text-xs text-destructive">
            {fields.answer.errors.join(", ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          プレーンテキストのみ。改行は保持されます（5000 文字以内）。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.order.id}>表示順</Label>
        <Input
          {...getInputProps(fields.order, { type: "number" })}
          placeholder="0"
          min={0}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          小さい数字が先に表示されます
        </p>
        {fields.order.errors && (
          <p id={fields.order.errorId} className="text-xs text-destructive">
            {fields.order.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Switch
          id={fields.isPublished.id}
          checked={isPublished}
          onCheckedChange={(checked) =>
            isPublishedControl.change(checked ? "on" : "")
          }
          disabled={isPending}
          aria-describedby={fields.isPublished.descriptionId}
        />
        <div id={fields.isPublished.descriptionId}>
          <p className="font-medium">{getPublishLabel(isPublished)}</p>
          <p className="text-sm text-muted-foreground">
            {isPublished
              ? "この質問は公開ページに表示されます"
              : "この質問は公開ページに表示されません"}
          </p>
        </div>
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
    </form>
  );
}
