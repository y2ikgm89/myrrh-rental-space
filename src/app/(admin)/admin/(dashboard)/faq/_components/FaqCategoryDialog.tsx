"use client";

/**
 * FaqCategoryDialog — Phase 1 Task 6 conform 移行 (Variant B canonical)
 *
 * FAQ カテゴリの作成・編集を Dialog で行う共用コンポーネント。/admin/faq（一覧）と
 * /admin/faq/[categoryId]（詳細）の両方から起動される。parent component
 * (`FaqCategoryListView` / `FaqCategoryActionCell` / `FaqCategoryDetailView`) が
 * `open` state を保持し、本 Dialog に `open` / `onOpenChange` を渡す controlled
 * パターン (`dialogs.md` Variant B)。
 *
 * - parent が `category={undefined}` で create、`category={category}` で edit を選択
 * - `useActionState` を本 Dialog 内で持ち、success 検知 → `onOpenChange(false)` は
 *   render 中 sync (`Adjusting State During Render` 公式パターン、`previousLastResult`
 *   比較)、副作用 (`toast` / `router.refresh`) は useEffect で分離
 * - create / edit は別 sub-component に分離し、それぞれ独立 `useActionState` を持つ
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
import { createFaqCategory, updateFaqCategory } from "@/admin/actions/faq";
import { faqCategoryFormSchema } from "@/admin/lib/validations/faq";
import type { FaqCategoryWithItems } from "@/shared/domain/faq/types";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";

type FaqCategoryDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** edit モード時の既存カテゴリ — undefined なら create mode */
  readonly category?: FaqCategoryWithItems;
};

export function FaqCategoryDialog(props: FaqCategoryDialogProps) {
  if (props.category) {
    return <FaqCategoryEditDialog {...props} category={props.category} />;
  }
  return <FaqCategoryCreateDialog {...props} />;
}

// =============================================================================
// 名前 → スラッグ自動生成 (create mode only)
// =============================================================================

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// =============================================================================
// Create
// =============================================================================

type CreateProps = Omit<FaqCategoryDialogProps, "category">;

function FaqCategoryCreateDialog({ open, onOpenChange }: CreateProps) {
  const router = useRouter();
  const [lastResult, formAction, isPending] = useActionState(
    createFaqCategory,
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
      toast.success("カテゴリを作成しました");
      router.refresh();
    }
  }, [isSuccess, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>カテゴリを作成</DialogTitle>
          <DialogDescription>新しい FAQ カテゴリを作成します</DialogDescription>
        </DialogHeader>
        <FaqCategoryFormBody
          formId="faq-category-create-form"
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          autoSlugFromName
          defaultValue={{
            name: "",
            slug: "",
            description: "",
            iconEmoji: "",
            order: "0",
            isActive: "on",
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
            form="faq-category-create-form"
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

type EditProps = Omit<FaqCategoryDialogProps, "category"> & {
  readonly category: FaqCategoryWithItems;
};

function FaqCategoryEditDialog({ open, onOpenChange, category }: EditProps) {
  const router = useRouter();
  const boundAction = updateFaqCategory.bind(null, category.id);
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
      toast.success("カテゴリを更新しました");
      router.refresh();
    }
  }, [isSuccess, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>カテゴリを編集</DialogTitle>
          <DialogDescription>カテゴリ情報を編集します</DialogDescription>
        </DialogHeader>
        <FaqCategoryFormBody
          formId={`faq-category-edit-form-${category.id}`}
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          autoSlugFromName={false}
          defaultValue={{
            name: category.name,
            slug: category.slug,
            description: category.description ?? "",
            iconEmoji: category.iconEmoji ?? "",
            order: String(category.order),
            isActive: category.isActive ? "on" : "",
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
            form={`faq-category-edit-form-${category.id}`}
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
  /** 名前入力時にスラッグを自動生成するか（create のみ true） */
  readonly autoSlugFromName: boolean;
  readonly defaultValue: {
    name: string;
    slug: string;
    description: string;
    iconEmoji: string;
    order: string;
    isActive: string;
  };
};

function FaqCategoryFormBody({
  formId,
  isPending,
  lastResult,
  formAction,
  autoSlugFromName,
  defaultValue,
}: FormBodyProps) {
  const [form, fields] = useForm({
    id: formId,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: faqCategoryFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue,
  });

  const nameControl = useInputControl(fields.name);
  const slugControl = useInputControl(fields.slug);
  const isActiveControl = useInputControl(fields.isActive);
  const isActive = isActiveControl.value === "on";

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      <input
        type="hidden"
        name={fields.isActive.name}
        value={isActiveControl.value ?? ""}
      />

      <div className="space-y-2">
        <Label htmlFor={fields.name.id}>カテゴリ名 *</Label>
        <Input
          {...getInputProps(fields.name, { type: "text" })}
          placeholder="例: ご予約について"
          disabled={isPending}
          onChange={(e) => {
            const value = e.target.value;
            nameControl.change(value);
            if (autoSlugFromName) {
              slugControl.change(slugify(value));
            }
          }}
        />
        {fields.name.errors && (
          <p id={fields.name.errorId} className="text-xs text-destructive">
            {fields.name.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.slug.id}>スラッグ *</Label>
        <Input
          {...getInputProps(fields.slug, { type: "text" })}
          placeholder="例: reservation"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          URL に使用される識別子です（半角英数字とハイフンのみ）
        </p>
        {fields.slug.errors && (
          <p id={fields.slug.errorId} className="text-xs text-destructive">
            {fields.slug.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.iconEmoji.id}>アイコン（絵文字）</Label>
        <Input
          {...getInputProps(fields.iconEmoji, { type: "text" })}
          placeholder="例: 🏠 🎯 ⭐"
          maxLength={4}
          disabled={isPending}
          className="w-24 text-center text-xl"
        />
        {fields.iconEmoji.errors && (
          <p id={fields.iconEmoji.errorId} className="text-xs text-destructive">
            {fields.iconEmoji.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.description.id}>説明</Label>
        <Textarea
          {...getTextareaProps(fields.description)}
          placeholder="カテゴリの説明（オプション）"
          rows={2}
          disabled={isPending}
        />
        {fields.description.errors && (
          <p
            id={fields.description.errorId}
            className="text-xs text-destructive"
          >
            {fields.description.errors.join(", ")}
          </p>
        )}
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
          id={fields.isActive.id}
          checked={isActive}
          onCheckedChange={(checked) =>
            isActiveControl.change(checked ? "on" : "")
          }
          disabled={isPending}
          aria-describedby={fields.isActive.descriptionId}
        />
        <div id={fields.isActive.descriptionId}>
          <p className="font-medium">{getPublishLabel(isActive)}</p>
          <p className="text-sm text-muted-foreground">
            {isActive
              ? "このカテゴリは公開ページに表示されます"
              : "このカテゴリは公開ページに表示されません"}
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
