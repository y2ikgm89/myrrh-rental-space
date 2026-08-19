"use client";

/**
 * FaqItemDialog
 *
 * 質問の作成・編集を Dialog で行う共用コンポーネント。parent component
 * (`FaqCategoryDetailView`) が `editingItem` + `open` state を保持し、本 Dialog
 * に `open` / `onOpenChange` を渡す controlled パターン。
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
import { getFormProps, useForm } from "@conform-to/react";
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
import { FaqItemTemplateSelect } from "./FaqItemTemplateSelect";
import type { FaqItemTemplate } from "./faq-item-templates";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";
import {
  HiddenControlInput,
  useFieldControl,
} from "@/shared/lib/conform/control";

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
          mode="create"
          formId="faq-item-create-form"
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          defaultValue={{
            categoryId,
            question: "",
            answer: "",
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
          mode="edit"
          formId={`faq-item-edit-form-${item.id}`}
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          defaultValue={{
            categoryId: item.categoryId,
            question: item.question,
            answer: item.answer,
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
  readonly mode: "create" | "edit";
  readonly formId: string;
  readonly isPending: boolean;
  readonly lastResult: SubmissionResult | undefined;
  readonly formAction: (formData: FormData) => void;
  readonly defaultValue: {
    categoryId: string;
    question: string;
    answer: string;
    isPublished: string;
  };
};

function FaqItemFormBody({
  mode,
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
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue,
  });

  const questionControl = useFieldControl(fields.question);
  const answerControl = useFieldControl(fields.answer);
  const isPublishedControl = useFieldControl(fields.isPublished);
  const isPublished = isPublishedControl.value === "on";

  const handleTemplateSelect = (template: FaqItemTemplate) => {
    questionControl.change(template.question);
    answerControl.change(template.answer);
  };

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      {/* categoryId は親から固定 */}
      <input
        type="hidden"
        name={fields.categoryId.name}
        value={defaultValue.categoryId}
      />
      <HiddenControlInput
        field={fields.isPublished}
        control={isPublishedControl}
      />

      {mode === "create" && (
        <FaqItemTemplateSelect
          onSelect={handleTemplateSelect}
          disabled={isPending}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor={fields.question.id}>質問 *</Label>
        <Input
          id={fields.question.id}
          name={fields.question.name}
          type="text"
          value={questionControl.value ?? ""}
          onChange={(e) => questionControl.change(e.target.value)}
          onBlur={questionControl.blur}
          placeholder="例: 予約はいつまでキャンセルできますか？"
          disabled={isPending}
          aria-invalid={fields.question.errors ? true : undefined}
          aria-describedby={
            fields.question.errors ? fields.question.errorId : undefined
          }
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
          id={fields.answer.id}
          name={fields.answer.name}
          value={answerControl.value ?? ""}
          onChange={(e) => answerControl.change(e.target.value)}
          onBlur={answerControl.blur}
          placeholder="回答を入力してください。改行は公開ページでも保持されます。"
          rows={8}
          disabled={isPending}
          aria-invalid={fields.answer.errors ? true : undefined}
          aria-describedby={
            fields.answer.errors ? fields.answer.errorId : undefined
          }
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
