"use client";

import { IconX } from "@tabler/icons-react";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { BaseFilters } from "@/admin/components/table";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { PostCategoryData } from "@/shared/domain/posts/types";
import { useFilterParamsWithCategory } from "@/admin/hooks";

type PostFiltersProps = {
  categories: PostCategoryData[];
};

export function PostFilters({ categories }: PostFiltersProps) {
  const { params, setCategory } = useFilterParamsWithCategory();

  // Round-4 audit Finding #15: staff 詳細ページの「記事一覧を表示」deep-link
  // (?authorId=<staffId>) の可視化 + 解除導線。useFilterParamsWithCategory は
  // Customer 系フィルタと共有の汎用 hook (adminCustomerSearchParamsParsers) で
  // authorId キーを持たないため、authorId だけを別の useQueryStates で読む
  // (nuqs は URL の同一 key を複数の useQueryStates 間で共有できる)。
  const [authorParams, setAuthorParams] = useQueryStates({
    authorId: parseAsString.withDefault(""),
    page: parseAsInteger.withDefault(1),
  });

  return (
    <BaseFilters searchPlaceholder="タイトル、本文で検索...">
      {authorParams.authorId && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void setAuthorParams({ authorId: null, page: 1 })}
        >
          スタッフの記事のみ表示中
          <IconX className="ml-2 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}

      {/* カテゴリフィルター */}
      <div className="w-full sm:w-48">
        <Select value={params.categoryId} onValueChange={setCategory}>
          <SelectTrigger aria-label="カテゴリで絞り込み">
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべてのカテゴリ</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </BaseFilters>
  );
}
