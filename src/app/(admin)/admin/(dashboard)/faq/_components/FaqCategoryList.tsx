"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { tv } from "tailwind-variants";
import { cn } from "@/shared/lib/cn";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui";
import {
  deleteFaqCategory,
  deleteFaqItem,
  toggleFaqItemPublished,
} from "@/admin/actions/faq";
import type { FaqCategoryWithItems } from "@/shared/domain/faq/types";
import { isMutationError } from "@/shared/lib/mutation-result";

const styles = tv({
  slots: {
    categoryCard: "overflow-hidden",
    categoryHeader: "cursor-pointer hover:bg-muted/50 transition-colors",
    categoryTitle: "flex items-center gap-2",
    itemList: "divide-y",
    itemRow:
      "flex items-center justify-between py-3 px-4 hover:bg-muted/30 transition-colors",
    question: "font-medium text-sm",
    actions: "flex items-center gap-1",
    emptyState: "py-8 text-center text-muted-foreground",
  },
})();

type FaqCategoryListProps = {
  categories: FaqCategoryWithItems[];
};

export function FaqCategoryList({ categories }: FaqCategoryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.id)),
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{
    type: "category" | "item";
    id: string;
    name: string;
  } | null>(null);

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteCategory = (id: string, name: string) => {
    setDeletingItem({ type: "category", id, name });
    setDeleteDialogOpen(true);
  };

  const handleDeleteItem = (id: string, question: string) => {
    setDeletingItem({ type: "item", id, name: question });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!deletingItem) return;

    startTransition(async () => {
      const result =
        deletingItem.type === "category"
          ? await deleteFaqCategory(deletingItem.id)
          : await deleteFaqItem(deletingItem.id);

      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success(
          deletingItem.type === "category"
            ? "カテゴリを削除しました"
            : "質問を削除しました",
        );
        router.refresh();
      }
      setDeleteDialogOpen(false);
      setDeletingItem(null);
    });
  };

  const handleToggleItemPublished = (id: string) => {
    startTransition(async () => {
      const result = await toggleFaqItemPublished(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? "FAQ項目を公開しました"
          : "FAQ項目を非公開にしました",
      );
      router.refresh();
    });
  };

  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className={styles.emptyState()}>
          <p>FAQカテゴリがまだ登録されていません</p>
          <Button asChild className="mt-4">
            <Link href="/admin/faq/categories/new">最初のカテゴリを作成</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);

          return (
            <Card key={category.id} className={styles.categoryCard()}>
              <CardHeader
                className={styles.categoryHeader()}
                onClick={() => toggleCategory(category.id)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className={styles.categoryTitle()}>
                    <svg
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isExpanded && "rotate-90",
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    {category.name}
                    <Badge variant="outline" className="ml-2">
                      {category.items.length}件
                    </Badge>
                    {!category.isActive && (
                      <Badge variant="secondary">非公開</Badge>
                    )}
                  </CardTitle>
                  <div
                    className={styles.actions()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/faq/categories/${category.id}/edit`}>
                        編集
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() =>
                        handleDeleteCategory(category.id, category.name)
                      }
                      disabled={category.items.length > 0}
                    >
                      削除
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-0">
                  {category.items.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      質問がありません
                    </div>
                  ) : (
                    <div className={styles.itemList()}>
                      {category.items.map((item) => (
                        <div key={item.id} className={styles.itemRow()}>
                          <div className="flex-1 min-w-0">
                            <p className={styles.question()}>{item.question}</p>
                            {!item.isPublished && (
                              <Badge variant="secondary" className="mt-1">
                                非公開
                              </Badge>
                            )}
                          </div>
                          <div className={styles.actions()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleItemPublished(item.id)}
                              disabled={isPending}
                            >
                              {item.isPublished ? "非公開" : "公開"}
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/admin/faq/items/${item.id}/edit`}>
                                編集
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() =>
                                handleDeleteItem(item.id, item.question)
                              }
                            >
                              削除
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deletingItem?.type === "category"
                ? "カテゴリを削除"
                : "質問を削除"}
            </DialogTitle>
            <DialogDescription>
              {deletingItem?.type === "category"
                ? `「${deletingItem?.name}」を削除しますか？`
                : "この質問を削除しますか？この操作は取り消せません。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isPending}
            >
              {isPending ? "削除中..." : "削除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
