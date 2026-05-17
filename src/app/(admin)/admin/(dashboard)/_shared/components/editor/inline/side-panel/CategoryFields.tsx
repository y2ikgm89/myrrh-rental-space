"use client";

/**
 * カテゴリ選択フィールド
 *
 * conform `FieldMetadata` ベース。既存カテゴリからの選択 + 新規カテゴリのインライン作成。
 */

import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { useInputControl, type FieldMetadata } from "@conform-to/react";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/admin/components/ui";
import { generateSlug } from "@/shared/lib/slug";

const SELECT_NONE_VALUE = "__none__";

export type CategoryOption = {
  id: string;
  name: string;
  slug?: string;
};

type CategoryFieldsProps = {
  categoryIdField: FieldMetadata<string | null | undefined>;
  /** カテゴリオプション */
  categories: readonly CategoryOption[];
  label?: string;
  placeholder?: string;
  /** なしを選択可能にするか */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** 新規カテゴリ作成時のコールバック（設定すると作成ボタンが表示される） */
  onCreateCategory?: (name: string) => Promise<CategoryOption | null>;
  disabled?: boolean;
};

export function CategoryFields({
  categoryIdField,
  categories,
  label = "カテゴリ",
  placeholder = "カテゴリを選択",
  allowEmpty = false,
  emptyLabel = "なし",
  onCreateCategory,
  disabled,
}: CategoryFieldsProps) {
  const control = useInputControl(categoryIdField);
  const categoryId = typeof control.value === "string" ? control.value : "";
  const categoryError = categoryIdField.errors?.[0];

  // 新規作成ダイアログ
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateCategory = async () => {
    if (!onCreateCategory || !newCategoryName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const newCategory = await onCreateCategory(newCategoryName.trim());
      if (newCategory) {
        control.change(newCategory.id);
        setIsDialogOpen(false);
        setNewCategoryName("");
      }
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "カテゴリの作成に失敗しました",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setNewCategoryName("");
    setCreateError(null);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={categoryIdField.id}>{label}</Label>
      <input type="hidden" name={categoryIdField.name} value={categoryId} />

      <div className="flex gap-2">
        <Select
          value={categoryId || (allowEmpty ? SELECT_NONE_VALUE : "")}
          onValueChange={(value) => {
            const newValue = value === SELECT_NONE_VALUE ? "" : value;
            control.change(newValue);
          }}
          {...(disabled !== undefined && { disabled })}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {allowEmpty && (
              <SelectItem value={SELECT_NONE_VALUE}>{emptyLabel}</SelectItem>
            )}
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {onCreateCategory && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setIsDialogOpen(true)}
            disabled={disabled}
            aria-label="新規カテゴリを作成"
          >
            <IconPlus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {categoryError && (
        <p className="text-sm text-destructive">{categoryError}</p>
      )}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>新規カテゴリを作成</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-category-name">カテゴリ名</Label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="カテゴリ名を入力"
                disabled={isCreating}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCategoryName.trim()) {
                    e.preventDefault();
                    void handleCreateCategory();
                  }
                }}
              />
              {newCategoryName.trim() && (
                <p className="text-xs text-muted-foreground">
                  スラッグ: {generateSlug(newCategoryName, "category")}
                </p>
              )}
            </div>

            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleDialogClose}
              disabled={isCreating}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={handleCreateCategory}
              disabled={isCreating || !newCategoryName.trim()}
            >
              {isCreating ? "作成中..." : "作成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
